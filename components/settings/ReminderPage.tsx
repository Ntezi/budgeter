import React from 'react';
import { View } from 'react-native';
import { FormField } from '@/components/patterns/FormLayout';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { ToggleRow } from '@/components/plan/ToggleRow';
import { Notice, SettingsPage } from './SettingsParts';

/** Daily reminder (09): the only place for it. Same three fields and the same save handler as before. */
export function ReminderPage(p: {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  email: string;
  setEmail: (v: string) => void;
  hour: string;
  setHour: (v: string) => void;
  error: string;
  saved: string;
  onSave: () => void;
  onBack: () => void;
}) {
  return (
    <SettingsPage testID="settings-reminder" title="Daily reminder" intro="One email a day asking you to update what is left in each account." onBack={p.onBack}>
      <View className="gap-4 rounded-xl border border-border bg-card p-3 md:p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <ToggleRow label="Send the daily reminder" value={p.enabled} onChange={p.setEnabled} />
        <FormField label="Email">
          <AppInput accessibilityLabel="Reminder email" value={p.email} onChangeText={p.setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" />
        </FormField>
        <FormField label="Hour (UTC, 0 to 23)">
          <AppInput accessibilityLabel="Reminder hour (UTC)" value={p.hour} onChangeText={p.setHour} placeholder="7" keyboardType="number-pad" />
        </FormField>
        <Notice kind="error" text={p.error} />
        <Notice kind="ok" text={p.saved} />
      </View>
      <AppButton label="Save reminder" size="touch-lg" className="w-full sm:w-auto sm:self-start" onPress={p.onSave} />
    </SettingsPage>
  );
}
