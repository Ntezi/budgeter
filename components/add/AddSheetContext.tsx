import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Text, View, useWindowDimensions } from 'react-native';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { AddSheet } from '@/components/add/AddSheet';
import { useSheet } from '@/components/patterns/AppSheet';
import { AppButton } from '@/components/ui/AppButton';
import { monthTitle } from '@/lib/rules/months';
import { layoutFor } from '@/lib/shell/nav';
import { useWorkspaceUid } from '@/providers/WorkspaceProvider';

type Ctx = { openAdd: (e?: unknown) => void };
const AddCtx = createContext<Ctx | null>(null);

export function useAddSheet(): Ctx {
  const ctx = useContext(AddCtx);
  if (!ctx) throw new Error('useAddSheet must be used inside the (shell) layout');
  return ctx;
}

/** Owns the one Add sheet for every shell route: +, sidebar button, `n` on desktop, ?action=new-expense. */
export function AddSheetProvider({ children }: { children: ReactNode }) {
  const uid = useWorkspaceUid();
  const router = useRouter();
  const params = useGlobalSearchParams<{ action?: string }>();
  const sheet = useSheet();
  const { width } = useWindowDimensions();
  const [saved, setSaved] = useState<string | null>(null);
  const fromParam = useRef(false);

  const openAdd = useCallback((e?: unknown) => sheet.show(e), [sheet]);

  // Open once per arrival of ?action=new-expense. Closing goes history.back() first and clears the
  // param after, so for one render the sheet is closed while the param still says new-expense:
  // without this flag that render reopened the sheet (BUDG-8 lane X round 4, diag-sheet log).
  const paramHandled = useRef(false);
  useEffect(() => {
    if (params.action !== 'new-expense') {
      paramHandled.current = false;
      return;
    }
    if (paramHandled.current || sheet.open) return;
    paramHandled.current = true;
    fromParam.current = true;
    sheet.show();
  }, [params.action, sheet]);

  const close = useCallback(
    (after?: () => void) =>
      sheet.hide(() => {
        if (fromParam.current) {
          fromParam.current = false;
          router.setParams({ action: '' } as any);
        }
        after?.();
      }),
    [router, sheet]
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || layoutFor(width) !== 'desktop') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey || sheet.open) return;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      e.preventDefault();
      sheet.show();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, width]);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), 8000);
    return () => clearTimeout(t);
  }, [saved]);

  const value = useMemo(() => ({ openAdd }), [openAdd]);
  return (
    <AddCtx.Provider value={value}>
      {children}
      <AddSheet open={sheet.open} uid={uid} onClose={() => close()} onSaved={setSaved} onGo={(href) => close(() => router.push(href as any))} />
      {saved ? (
        <View pointerEvents="box-none" className="absolute inset-x-0 bottom-20 items-center px-4 md:bottom-6">
          <View role="status" className="w-full max-w-md flex-row items-center gap-3 rounded-xl border border-border bg-card py-1 pl-4 pr-1 shadow-card dark:border-zinc-800 dark:bg-zinc-900">
            <Text className="min-w-0 flex-1 text-sm font-medium text-foreground dark:text-zinc-50">Expense saved to {monthTitle(saved)}.</Text>
            <AppButton
              label="View"
              variant="ghost"
              size="touch"
              onPress={() => {
                const pid = saved;
                setSaved(null);
                router.push(`/transactions?month=${pid}` as any);
              }}
            />
          </View>
        </View>
      ) : null}
    </AddCtx.Provider>
  );
}
