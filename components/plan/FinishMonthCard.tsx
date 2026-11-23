import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { AppModal } from '@/components/ui/AppModal';
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
  const [confirm, setConfirm] = useState<null | 'CLOSE' | 'CLOSE_START'>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm === 'CLOSE') await onCloseMonth();
      else await onCloseAndStart();
      setConfirm(null);
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
            <AppButton label="Close month" variant="outline" size="touch" className="min-w-0 flex-1" onPress={() => setConfirm('CLOSE')} />
            <AppButton label={`Close & start ${nextLabel}`} variant="outline" size="touch" className="min-w-0 flex-1" onPress={() => setConfirm('CLOSE_START')} />
          </View>
        </>
      )}
      <DangerTextButton label="Delete this plan" onPress={onDelete} />
      <AppModal open={confirm !== null} onClose={() => setConfirm(null)} title={`Close ${monthLabel}?`}>
        <View className="gap-4">
          <Text className="text-base text-foreground dark:text-zinc-50">
            {confirm === 'CLOSE_START'
              ? `${monthLabel} becomes read-only and ${nextLabel} opens. A new ${nextLabel} starts from your regular costs; an existing one is opened as it is.`
              : `${monthLabel} becomes read-only.`}
          </Text>
          <View className="flex-row flex-wrap justify-end gap-3">
            <AppButton label="Keep open" variant="outline" size="touch" onPress={() => setConfirm(null)} />
            <AppButton label={busy ? 'Closing…' : confirm === 'CLOSE_START' ? `Close & start ${nextLabel}` : 'Close month'} size="touch" onPress={() => void run()} disabled={busy} />
          </View>
        </View>
      </AppModal>
    </View>
  );
}
