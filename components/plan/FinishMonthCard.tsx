import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { AppModal } from '@/components/ui/AppModal';
import { useSheet } from '@/components/patterns/AppSheet';
import { AppButton } from '@/components/ui/AppButton';
import { DangerTextButton } from '@/components/plan/DangerTextButton';

type Props = {
  monthLabel: string;
  nextLabel: string;
  readOnly: boolean;
  onCloseMonth: () => Promise<void> | void;
  onCloseAndStart: () => Promise<void> | void;
  onDelete: () => void;
};

/** "Finish November": Close month and Close & start next behind a confirm; Delete names the plan. */
export function FinishMonthCard({ monthLabel, nextLabel, readOnly, onCloseMonth, onCloseAndStart, onDelete }: Props) {
  const [kind, setKind] = useState<'CLOSE' | 'CLOSE_START'>('CLOSE');
  const [busy, setBusy] = useState(false);
  // Q-1: the confirm closes on Escape and Back from anywhere and focus returns to the button (useSheet).
  const sheet = useSheet();
  const confirm = sheet.open ? kind : null;
  const ask = (k: 'CLOSE' | 'CLOSE_START', e?: unknown) => {
    setKind(k);
    sheet.show(e);
  };
  const run = async () => {
    if (!confirm) return;
    if (confirm === 'CLOSE_START') {
      // Opens the next month: navigate only once the dialog's history entry is gone.
      sheet.hide(() => void onCloseAndStart());
      return;
    }
    setBusy(true);
    try {
      await onCloseMonth();
      sheet.hide();
    } finally {
      setBusy(false);
    }
  };
  return (
    <View testID="finish-month" className="gap-3 rounded-xl border border-border bg-card p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <Text className="text-base font-semibold text-foreground dark:text-zinc-50">{readOnly ? 'Next month' : `Finish ${monthLabel}`}</Text>
      {readOnly ? (
        <AppButton label={`Start ${nextLabel}`} variant="outline" size="touch" onPress={() => void onCloseAndStart()} />
      ) : (
        <>
          <Text className="text-sm text-muted-foreground dark:text-zinc-400">Closing makes the month read-only. Nothing is posted or moved.</Text>
          <View className="flex-row flex-wrap gap-3">
            <AppButton label="Close month" variant="outline" size="touch" className="min-w-0 flex-1" onPress={(e) => ask('CLOSE', e)} />
            <AppButton label={`Close & start ${nextLabel}`} variant="outline" size="touch" className="min-w-0 flex-1" onPress={(e) => ask('CLOSE_START', e)} />
          </View>
        </>
      )}
      <DangerTextButton label="Delete this plan" onPress={onDelete} />
      <AppModal open={confirm !== null} onClose={() => sheet.hide()} title={`Close ${monthLabel}?`} testID="close-month-confirm">
        <View className="gap-4">
          <Text className="text-base text-foreground dark:text-zinc-50">
            {confirm === 'CLOSE_START'
              ? `${monthLabel} becomes read-only and ${nextLabel} opens. A new ${nextLabel} starts from your regular costs; an existing one is opened as it is.`
              : `${monthLabel} becomes read-only.`}
          </Text>
          <View className="flex-row flex-wrap justify-end gap-3">
            <AppButton label="Keep open" variant="outline" size="touch" onPress={() => sheet.hide()} />
            <AppButton label={busy ? 'Closing…' : confirm === 'CLOSE_START' ? `Close & start ${nextLabel}` : 'Close month'} size="touch" onPress={() => void run()} disabled={busy} />
          </View>
        </View>
      </AppModal>
    </View>
  );
}
