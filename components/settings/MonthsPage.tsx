import React from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useSheet } from '@/components/patterns/AppSheet';
import { AppButton } from '@/components/ui/AppButton';
import { periodTitleFromId, type PeriodDoc } from '@/lib/repo/periods';
import { ConfirmSheet, RadioRow, SettingsPage, SettingsRow, SettingsSection } from './SettingsParts';

/**
 * Months (09): which month is active (same setActivePeriodId), Close & start next (same handler, now
 * behind a confirm), every month with its status, each opening in Plan. Closed months are read-only there.
 */
export function MonthsPage(p: {
  periods: (PeriodDoc & { id: string })[];
  activePeriodId: string;
  setActivePeriodId: (id: string) => void;
  canRollForward: boolean;
  monthlyMode: boolean;
  closing: boolean;
  onCloseAndStartNext: () => Promise<void>;
  onBack: () => void;
}) {
  const router = useRouter();
  const confirm = useSheet();
  const sorted = [...p.periods].sort((a, b) => (a.id < b.id ? 1 : -1));
  const title = (id: string) => p.periods.find((x) => x.id === id)?.title || (/^\d{4}-\d{2}$/.test(id) ? periodTitleFromId(id) : id);
  return (
    <SettingsPage testID="settings-months" title="Months" intro="The active month is where new spending goes by default." onBack={p.onBack}>
      <SettingsSection title="Active month">
        {sorted.length ? (
          sorted.slice(0, 6).map((m) => (
            <RadioRow key={m.id} label={m.title || title(m.id)} sub={m.status === 'DECIDED' ? 'Closed' : 'Open'} checked={m.id === p.activePeriodId} onPress={() => p.setActivePeriodId(m.id)} />
          ))
        ) : (
          <SettingsRow label="No months yet" value="Start one from Plan." />
        )}
      </SettingsSection>

      {p.activePeriodId && p.canRollForward ? (
        <AppButton label={p.closing ? 'Closing…' : `Close ${title(p.activePeriodId)} and start the next`} variant="outline" size="touch" className="self-start" disabled={p.closing} onPress={(e) => confirm.show(e)} />
      ) : !p.monthlyMode ? (
        <Text className="text-xs text-muted-foreground dark:text-zinc-400">Close and start next works only in monthly workspaces.</Text>
      ) : null}

      <SettingsSection title="All months" testID="months-list">
        {sorted.map((m) => (
          <SettingsRow key={m.id} label={m.title || title(m.id)} value={m.status === 'DECIDED' ? 'Closed · read-only' : 'Open'} onPress={() => router.push(`/budgets/${m.id}`)} />
        ))}
      </SettingsSection>

      <ConfirmSheet
        open={confirm.open}
        onClose={() => confirm.hide()}
        testID="close-month-sheet"
        title="Close this month?"
        message={`${title(p.activePeriodId)} becomes read-only and the next month opens from your repeats.`}
        actionLabel="Close and start next"
        busy={p.closing}
        onConfirm={async () => {
          await p.onCloseAndStartNext();
          confirm.hide();
        }}
      />
    </SettingsPage>
  );
}
