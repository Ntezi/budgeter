// BUDG-5 receipt flow: step 1 review lines (pre-filled from the shopping list, nothing retyped),
// step 2 link to an existing expense or record ONE new expense through a Save that shows date,
// account and amount. Manual entry only (AC-3): no scan, photo or outside service; nothing posts
// before the explicit Save. Existing UI components and class names only.
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import { AppSheet } from '@/components/patterns/AppSheet';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { DropdownField } from '@/components/ui/DropdownField';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { db } from '@/lib/firebase';
import { fmtMoney } from '@/lib/format';
import { fromMinor, minorToText, parseMinor, toMinor } from '@/lib/money';
import { localDateISO, isDateISO, postingPeriodId } from '@/lib/rules/postingMonth';
import { normalizeQuantity } from '@/lib/rules/units';
import { lastComparable, priceChipText, variantKeyOf, type PriceObservation } from '@/lib/rules/priceCompare';
import { RECEIPT_UNITS, receiptTotalMinor, type Receipt, type ReceiptLine } from '@/lib/repo/receiptsCore';
import {
  confirmReceiptAsNewExpense, confirmReceiptToExisting, listPriceObservationsIn, saveReceiptDraft,
} from '@/lib/repo/receiptsOps';
import type { Account } from '@/lib/repo/accounts';
import type { ShoppingCatalogItem, ShoppingListItem } from '@/lib/repo/shopping';

export const APP_CURRENCY = process.env.EXPO_PUBLIC_APP_CURRENCY || 'GHS';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const UNIT_OPTIONS = RECEIPT_UNITS.map((u) => ({ label: u, value: u }));

type LineDraft = {
  lineId: string; name: string; qty: string; unit: string; total: string;
  catalogItemId: string; variant?: ReceiptLine['variant']; promo: boolean; isReturn: boolean;
};
type TxRow = { id: string; name?: string; amount?: number; date?: string; type?: string };

function newId() {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return String(c.randomUUID());
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
const shortId = () => newId().replace(/[^A-Za-z0-9]/g, '').slice(0, 12);

export function lineDraftsFromItems(items: ShoppingListItem[], catalog: ShoppingCatalogItem[]): LineDraft[] {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  return items.map((it) => {
    const qty = Math.max(1, Number(it.actualQuantity ?? it.quantity ?? 1));
    const unitPrice = Number(it.actualPrice ?? it.price ?? 0);
    const total = unitPrice > 0 ? minorToText(toMinor(unitPrice * qty)) : '';
    const cat = it.catalogItemId ? byId.get(it.catalogItemId) : undefined;
    const variant = cat?.variant?.packSize ? { packSize: cat.variant.packSize, unit: cat.variant.unit } : undefined;
    return {
      lineId: shortId(), name: it.name || '', qty: String(qty), unit: it.unit || 'pc', total,
      catalogItemId: cat?.id || '', variant, promo: false, isReturn: false,
    };
  });
}

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  ownerUid: string;
  actorUid: string;
  accounts: Account[];
  catalog: ShoppingCatalogItem[];
  prefill: LineDraft[];
  sourceListId?: string;
  /** Transactions row "Attach receipt" (design-BUDG-5 entry point 2): opens on "Link existing" for this expense. */
  linkTo?: { txId: string; date: string; amount: number; name?: string };
};

export function ReceiptModal({ open, onClose, onSaved, ownerUid, actorUid, accounts, catalog, prefill, sourceListId, linkTo }: Props) {
  const [receiptId, setReceiptId] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [storeName, setStoreName] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(localDateISO());
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [mode, setMode] = useState<'NEW' | 'EXISTING'>('NEW');
  const [accountId, setAccountId] = useState('');
  const [txId, setTxId] = useState('');
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [history, setHistory] = useState<PriceObservation[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // A new receipt id per opening, kept in state: every retry of this form writes the same docs (AC-2).
  useEffect(() => {
    if (!open) return;
    setReceiptId(newId());
    setStep(1);
    setStoreName('');
    setPurchaseDate(localDateISO());
    setLines(prefill.length ? prefill : [{ lineId: shortId(), name: '', qty: '1', unit: 'pc', total: '', catalogItemId: '', promo: false, isReturn: false }]);
    setMode('NEW');
    setTxId('');
    if (linkTo) {
      if (isDateISO(linkTo.date)) setPurchaseDate(linkTo.date);
      const total = Number.isFinite(Number(linkTo.amount)) ? minorToText(toMinor(Math.abs(Number(linkTo.amount)))) : '';
      setLines([{ lineId: shortId(), name: linkTo.name || '', qty: '1', unit: 'pc', total, catalogItemId: '', promo: false, isReturn: false }]);
      setMode('EXISTING');
      setTxId(linkTo.txId);
    }
    setError('');
    listPriceObservationsIn(db, ownerUid).then(setHistory).catch(() => setHistory([]));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  useEffect(() => {
    if (!accountId && activeAccounts[0]?.id) setAccountId(activeAccounts[0].id);
  }, [activeAccounts, accountId]);

  const periodId = isDateISO(purchaseDate) ? postingPeriodId(purchaseDate) : '';
  useEffect(() => {
    if (!open || step !== 2 || !periodId) return;
    getDocs(collection(db, 'users', ownerUid, 'periods', periodId, 'transactions'))
      .then((s) => setTxs(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).filter((t) => (t.type || 'EXPENSE') === 'EXPENSE')))
      .catch(() => setTxs([]));
  }, [open, step, periodId, ownerUid]);

  const parsed = lines.map((l) => ({ l, minor: parseMinor(l.total), qty: Number(l.qty) }));
  const totalMinor = parsed.every((p) => p.minor !== null)
    ? receiptTotalMinor(parsed.map((p) => ({ lineTotalMinor: p.minor as number, isReturn: p.l.isReturn })))
    : null;
  const catalogOptions = useMemo(
    () => [{ label: 'Not in catalog', value: '' }, ...catalog.filter((c) => c.id).map((c) => ({ label: c.name, value: c.id as string }))],
    [catalog]
  );
  const fmt = (minor: number) => fmtMoney(fromMinor(minor), APP_CURRENCY);
  const sortedTxs = useMemo(() => {
    const target = totalMinor ?? 0;
    return [...txs].sort((a, b) => Math.abs(toMinor(a.amount || 0) - target) - Math.abs(toMinor(b.amount || 0) - target));
  }, [txs, totalMinor]);

  function chip(p: (typeof parsed)[number]) {
    if (!p.l.catalogItemId) return 'Not in catalog';
    if (p.minor === null || !(p.qty > 0)) return 'Missing quantity or price';
    const n = normalizeQuantity(p.qty, p.l.unit, p.l.variant);
    const o: PriceObservation = {
      id: `${receiptId}_${p.l.lineId}`, receiptId, catalogItemId: p.l.catalogItemId, variantKey: variantKeyOf(p.l.variant),
      currencyCode: APP_CURRENCY, observedOn: purchaseDate, lineTotalMinor: p.minor, baseUnit: n?.baseUnit ?? null,
      baseQty: n?.baseQty ?? null, isReturn: p.l.isReturn, promo: p.l.promo,
    };
    return priceChipText(o, lastComparable(o, history), fmt);
  }

  function setLine(lineId: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, ...patch } : l)));
  }

  function toReceipt(): Receipt {
    return {
      id: receiptId, status: 'DRAFT', storeName, purchaseDate, currencyCode: APP_CURRENCY, totalMinor: 0, createdBy: actorUid,
      sourceListId,
      lines: parsed.map(({ l, minor, qty }) => {
        if (minor === null) throw new Error(`${l.name || 'Item'}: enter the price paid, like 12.50.`);
        return {
          lineId: l.lineId, name: l.name, quantity: qty, unit: l.unit, lineTotalMinor: minor,
          catalogItemId: l.catalogItemId || undefined, variant: l.variant, promo: l.promo, isReturn: l.isReturn,
        };
      }),
    };
  }

  async function next() {
    setError('');
    setSaving(true);
    try {
      await saveReceiptDraft(db, ownerUid, toReceipt()); // a draft never posts money
      setStep(2);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save the receipt.');
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (saving) return; // double press: the same ids make a second call a no-op anyway
    setError('');
    setSaving(true);
    try {
      const r = toReceipt();
      if (mode === 'NEW') {
        const res = await confirmReceiptAsNewExpense(db, ownerUid, r, { accountId });
        onSaved(res.created ? `Receipt saved and expense recorded in ${monthLabel}.` : 'Receipt was already saved.');
      } else {
        if (!txId) throw new Error('Choose the expense this receipt belongs to.');
        const res = await confirmReceiptToExisting(db, ownerUid, r, { periodId, txId });
        onSaved(res.created ? 'Receipt linked to the expense.' : 'Receipt was already linked.');
      }
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save the receipt.');
    } finally {
      setSaving(false);
    }
  }

  const monthLabel = periodId ? `${MONTHS[Number(periodId.slice(5, 7)) - 1]} ${periodId.slice(0, 4)}` : '';
  const accountName = activeAccounts.find((a) => a.id === accountId)?.name || '';

  const addLine = () => setLines((prev) => [...prev, { lineId: shortId(), name: '', qty: '1', unit: 'pc', total: '', catalogItemId: '', promo: false, isReturn: false }]);
  const footer =
    step === 1 ? (
      <>
        <Text className="text-base font-semibold text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>
          Total: {totalMinor === null ? 'enter every price' : fmt(totalMinor)}
        </Text>
        {error ? <Text role="alert" className="text-sm text-destructive dark:text-red-300">{error}</Text> : null}
        <AppButton label={saving ? 'Saving…' : 'Next'} size="touch-lg" className="w-full dark:bg-zinc-50" textClassName="text-base dark:text-zinc-900" disabled={saving || !lines.length} onPress={() => void next()} />
        <AppButton label="Cancel" variant="ghost" size="touch" onPress={onClose} />
      </>
    ) : (
      <>
        {mode === 'NEW' ? (
          <View className="gap-1" testID="receipt-save-summary">
            <Text className="text-sm font-semibold text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>
              {`Posts to ${monthLabel} · ${accountName || 'choose account'} · ${totalMinor === null ? '-' : fmt(totalMinor)} · ${purchaseDate}`}
            </Text>
            <Text className="text-sm text-muted-foreground dark:text-zinc-400">{`Date: ${purchaseDate} · Account: ${accountName || 'choose one'} · Amount: ${totalMinor === null ? '-' : fmt(totalMinor)}`}</Text>
          </View>
        ) : null}
        {error ? <Text role="alert" className="text-sm text-destructive dark:text-red-300">{error}</Text> : null}
        <AppButton
          label={saving ? 'Saving…' : mode === 'NEW' ? 'Save expense' : 'Link receipt'}
          size="touch-lg"
          className="w-full dark:bg-zinc-50"
          textClassName="text-base dark:text-zinc-900"
          disabled={saving || (mode === 'NEW' ? !accountId : !txId)}
          onPress={() => void save()}
        />
        <AppButton label="Back" variant="ghost" size="touch" disabled={saving} onPress={() => setStep(1)} />
      </>
    );

  return (
    <AppSheet open={open} onClose={() => !saving && onClose()} title={step === 1 ? 'Receipt: check items' : 'Receipt: save'} footer={footer} testID="receipt-sheet">
      {step === 1 ? (
        <View className="gap-4">
          <View className="flex-row flex-wrap gap-2">
            <AppInput value={storeName} onChangeText={setStoreName} placeholder="Store (optional)" accessibilityLabel="Store" className="h-11 min-w-40 flex-1 text-base" />
            <AppInput value={purchaseDate} onChangeText={setPurchaseDate} placeholder="YYYY-MM-DD" accessibilityLabel="Purchase date" className="h-11 w-36 text-center text-base" />
          </View>
          <Text className="text-sm text-muted-foreground dark:text-zinc-400">Check each item, quantity and the price paid. Nothing is recorded yet.</Text>
          <View className="overflow-hidden rounded-xl border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
            {parsed.map((p, i) => (
              <View key={p.l.lineId} className={`gap-2 p-3 ${i > 0 ? 'border-t border-border dark:border-zinc-800' : ''}`} testID="receipt-line">
                <View className="flex-row items-center gap-2">
                  <AppInput value={p.l.name} onChangeText={(v) => setLine(p.l.lineId, { name: v })} placeholder="Item" accessibilityLabel="Receipt item name" className="h-11 min-w-0 flex-1 text-base" />
                  <AppInput value={p.l.total} onChangeText={(v) => setLine(p.l.lineId, { total: v })} keyboardType="decimal-pad" placeholder="Paid" accessibilityLabel="Price paid" className="h-11 w-24 text-right text-base" />
                </View>
                <View className="flex-row items-center gap-2">
                  <AppInput value={p.l.qty} onChangeText={(v) => setLine(p.l.lineId, { qty: v })} keyboardType="numeric" accessibilityLabel="Receipt quantity" className="h-11 w-16 text-center text-base" />
                  <View className="min-w-0 flex-1">
                    <DropdownField value={p.l.unit} options={UNIT_OPTIONS} onChange={(v) => setLine(p.l.lineId, { unit: v })} placeholder="Unit" menuStrategy="inline" triggerClassName="min-h-11" />
                  </View>
                  <IconActionButton icon="trash-can-outline" label="Remove line" variant="danger" onPress={() => setLines((prev) => prev.filter((x) => x.lineId !== p.l.lineId))} />
                </View>
                <DropdownField value={p.l.catalogItemId} options={catalogOptions} onChange={(v) => setLine(p.l.lineId, { catalogItemId: v })} placeholder="Catalog item" menuStrategy="inline" triggerClassName="min-h-11" />
                <Text className="text-sm text-muted-foreground dark:text-zinc-400" testID="price-chip">{chip(p)}</Text>
                <View className="flex-row flex-wrap gap-2">
                  <AppButton label={p.l.promo ? 'Promo' : 'No promo'} size="touch" variant={p.l.promo ? 'primary' : 'outline'} onPress={() => setLine(p.l.lineId, { promo: !p.l.promo })} />
                  <AppButton label={p.l.isReturn ? 'Return' : 'Bought'} size="touch" variant={p.l.isReturn ? 'primary' : 'outline'} onPress={() => setLine(p.l.lineId, { isReturn: !p.l.isReturn })} />
                </View>
              </View>
            ))}
          </View>
          <AppButton label="+ Add line" variant="ghost" size="touch" className="self-start" onPress={addLine} />
        </View>
      ) : (
        <View className="gap-4">
          <AppSegmented value={mode} touch options={[{ label: 'Record new expense', value: 'NEW' }, { label: 'Link existing', value: 'EXISTING' }]} onChange={setMode} />
          {mode === 'NEW' ? (
            <DropdownField value={accountId} options={activeAccounts.map((a) => ({ label: a.name, value: a.id as string }))} onChange={setAccountId} placeholder="Account that paid" menuStrategy="inline" triggerClassName="min-h-11" />
          ) : (
            <DropdownField
              value={txId}
              options={sortedTxs.map((t) => ({ label: `${t.date || ''} · ${t.name || 'Expense'} · ${fmtMoney(t.amount || 0, APP_CURRENCY)}`, value: t.id }))}
              onChange={setTxId}
              placeholder={`Expense in ${monthLabel}`}
              menuStrategy="inline"
              triggerClassName="min-h-11"
            />
          )}
        </View>
      )}
    </AppSheet>
  );
}
