// BUDG-43 household-side hooks: keep the chef's price-free catalog copy in step (AC-4) and turn
// chef-added items into pending catalog entries (AC-2). Both run only on household clients.
import { useEffect, useMemo, useRef } from 'react';
import { db } from '@/lib/firebase';
import { activeWorkspaceId } from '@/lib/repo/scope';
import { ensureChefPendingIn, syncCatalogCopyIn, type ChefItem } from '@/lib/repo/catalogPendingOps';
import { toCatalogCopy, type CatalogSource } from '@/lib/rules/catalogPending';

/** One key per projected catalog (name/unit/category only): a price change never triggers a sync. */
function copyKey(catalog: CatalogSource[]) {
  return catalog
    .map((row) => {
      const c = toCatalogCopy(row);
      return c ? `${row.id}\u0001${c.name}\u0001${c.unit}\u0001${c.category}` : '';
    })
    .filter(Boolean)
    .sort()
    .join('\u0002');
}

/**
 * AC-4: when the household has a shared list or the catalog open, the copy follows the catalog
 * (add, rename, delete). One read of the copy per change, writes only for what differs.
 * Errors (e.g. the chef left: share REVOKED) are ignored; the copy is then unreadable to the chef anyway.
 */
export function useCatalogCopySync(enabled: boolean, catalog: CatalogSource[], shareIds: string[], loaded = true) {
  const key = useMemo(() => copyKey(catalog), [catalog]);
  const shares = shareIds.filter(Boolean).sort().join('|');
  const latest = useRef(catalog);
  latest.current = catalog;
  useEffect(() => {
    if (!enabled || !loaded || !shares) return;
    const t = setTimeout(() => {
      shares.split('|').forEach((shareId) => {
        syncCatalogCopyIn(db, shareId, latest.current).catch(() => undefined);
      });
    }, 400);
    return () => clearTimeout(t);
  }, [enabled, loaded, key, shares]);
}

/** AC-2: chef-created shared items -> pending catalog entries (idempotent, see ensureChefPendingIn). */
export function useChefPendingEntries(
  ownerUid: string,
  share: { shareId: string; chefUid: string; listId?: string; listName?: string; active: boolean } | null,
  sharedItems: ChefItem[],
  catalog: CatalogSource[],
  catalogLoaded: boolean
) {
  const done = useRef(new Set<string>());
  const chefItems = share?.active ? sharedItems.filter((it) => it.id && it.createdBy === share.chefUid) : [];
  const itemsKey = chefItems.map((it) => `${it.id}:${it.name}`).join('|');
  const latest = useRef({ catalog, chefItems });
  latest.current = { catalog, chefItems };
  useEffect(() => {
    if (!ownerUid || !share?.active || !catalogLoaded || !itemsKey) return;
    let stop = false;
    (async () => {
      for (const it of latest.current.chefItems) {
        if (stop) return;
        const k = `${share.shareId}/${it.id}`;
        if (done.current.has(k)) continue;
        try {
          await ensureChefPendingIn(db, ownerUid, share, it, latest.current.catalog, activeWorkspaceId() || undefined);
          done.current.add(k);
        } catch {
          // retried on the next change; the transaction keeps it to one entry
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, [ownerUid, share?.shareId, share?.chefUid, share?.active, catalogLoaded, itemsKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
