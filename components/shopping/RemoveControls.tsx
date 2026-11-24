// BUDG-42: the pieces shared by the household list and the chef view for removing items fast.
import React, { useEffect, useRef } from 'react';
import { Platform, Text, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppModal } from '@/components/ui/AppModal';
import { useSheetEffects } from '@/components/shopping/useSheetEffects';
import { REMOVE_CONFIRM_BODY, removeConfirmTitle } from '@/lib/rules/shoppingRemoval';

const WEB = Platform.OS === 'web' && typeof window !== 'undefined';
let ownBackPending = false; // the popstate of our own history.back() must not close a select mode opened right after

/**
 * Select mode on web: Escape and browser Back leave it (items kept). Like useSheetEffects, but the late
 * popstate of a select mode that just ended (Cancel, then a long-press at once) is ignored.
 */
export function useSelectModeEffects(active: boolean, leave: () => void) {
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    if (!WEB || !active) return;
    window.history.pushState(window.history.state, '', window.location.href);
    let pushed = true;
    const onPop = () => {
      if (ownBackPending) {
        ownBackPending = false;
        return;
      }
      if (!pushed) return;
      pushed = false;
      leaveRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') leaveRef.current();
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey, true);
      if (pushed) {
        ownBackPending = true;
        window.history.back();
        setTimeout(() => (ownBackPending = false), 600);
      }
    };
  }, [active]);
}

/** Replaces the add field while selecting: "n selected" · Select all · Remove (n) · Cancel. */
export function SelectBar({
  count,
  allSelected,
  onSelectAll,
  onRemove,
  onCancel,
}: {
  count: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  return (
    <View testID="select-bar" className="flex-row flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-1 dark:border-zinc-800 dark:bg-zinc-900">
      <Text accessibilityLiveRegion="polite" className="min-w-0 flex-1 text-sm font-medium text-foreground dark:text-zinc-50">{`${count} selected`}</Text>
      <AppButton label={allSelected ? 'Select none' : 'Select all'} variant="ghost" size="touch" className="px-2" onPress={onSelectAll} />
      <AppButton label={`Remove (${count})`} variant="destructive" size="touch" className="px-3" disabled={count === 0} onPress={onRemove} />
      <AppButton label="Cancel" variant="ghost" size="touch" className="px-2" onPress={onCancel} />
    </View>
  );
}

/** One confirmation for every bulk removal: names the count and the list. */
export function RemoveConfirmDialog({
  open,
  count,
  listName,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  count: number;
  listName: string;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useSheetEffects(open, () => !busy && onClose());
  return (
    <AppModal open={open} onClose={() => !busy && onClose()} title={removeConfirmTitle(count, listName)}>
      <View className="gap-4" testID="remove-confirm">
        <Text className="text-sm text-foreground dark:text-zinc-50">{REMOVE_CONFIRM_BODY}</Text>
        {error ? <Text role="alert" className="text-sm text-destructive dark:text-red-300">{error}</Text> : null}
        <View className="flex-row gap-2">
          <AppButton label="Keep items" variant="outline" size="touch" className="flex-1" disabled={busy} onPress={onClose} />
          <AppButton label={busy ? 'Removing…' : `Remove ${count}`} variant="destructive" size="touch" className="flex-1" testID="confirm-remove" disabled={busy} onPress={onConfirm} />
        </View>
      </View>
    </AppModal>
  );
}

/** "Removed <name> · Undo" for about 5 s after a swipe or trash removal. */
export function UndoNotice({ name, onUndo, onDone }: { name: string; onUndo: () => void; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), 5000);
    return () => clearTimeout(t);
  }, [name]);
  return (
    <View testID="undo-notice" className="absolute bottom-3 left-3 right-3 flex-row items-center gap-2 self-center rounded-xl bg-foreground px-4 py-1 dark:bg-zinc-100" style={{ maxWidth: 480 }}>
      <Text accessibilityLiveRegion="polite" numberOfLines={1} className="min-w-0 flex-1 text-sm text-background dark:text-zinc-900">{`Removed ${name}`}</Text>
      <AppButton label="Undo" variant="ghost" size="touch" className="px-2" textClassName="text-background dark:text-zinc-900" onPress={onUndo} />
    </View>
  );
}
