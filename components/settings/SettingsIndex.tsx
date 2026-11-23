import React, { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useSheet } from '@/components/patterns/AppSheet';
import { AppButton } from '@/components/ui/AppButton';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { ConfirmSheet, SettingsRow, SettingsSection, type SettingsPageId } from './SettingsParts';

/** Settings index (09): profile, Household, App, Sign out. Each row opens one sub-page. */
export function SettingsIndex(p: {
  email: string;
  initials: string;
  uid: string;
  workspaceLabel: string;
  peopleCount: number;
  ownedByMe: boolean;
  reminderOn: boolean;
  activeMonth: string;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  current: SettingsPageId | null;
  open: (page: SettingsPageId) => void;
  onSignOut: () => void;
}) {
  const signOut = useSheet();
  const [copied, setCopied] = useState('');
  const phone = Platform.OS !== 'web';

  async function copy() {
    try {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(p.uid);
        setCopied('Copied');
      } else setCopied('Select the ID to copy it');
    } catch {
      setCopied('Select the ID to copy it');
    }
  }

  return (
    <View testID="settings-index" className="gap-5">
      <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-muted dark:bg-zinc-800">
          <Text className="text-base font-semibold text-foreground dark:text-zinc-50">{p.initials}</Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-base font-semibold text-foreground dark:text-zinc-50" style={{ overflowWrap: 'anywhere' } as never}>{p.email}</Text>
          <Text className="text-sm text-muted-foreground dark:text-zinc-400">Signed in with Google</Text>
        </View>
      </View>

      <SettingsSection title="Household">
        <SettingsRow testID="settings-row-workspace" label="Workspace" value={p.workspaceLabel} selected={p.current === 'workspace'} onPress={() => p.open('workspace')} />
        <SettingsRow
          testID="settings-row-people"
          label="People"
          value={p.ownedByMe ? (p.peopleCount ? (p.peopleCount === 1 ? '1 person shares this household' : `${p.peopleCount} people share this household`) : 'Only you') : 'Shared with you'}
          selected={p.current === 'people'}
          onPress={() => p.open('people')}
        />
        <View className="min-h-14 flex-row flex-wrap items-center gap-3 px-4 py-2">
          <View className="min-w-0 flex-1">
            <Text className="text-base font-medium text-foreground dark:text-zinc-50">Your ID for sharing</Text>
            <Text selectable className="text-sm text-muted-foreground dark:text-zinc-400" style={{ overflowWrap: 'anywhere' } as never}>{p.uid || '-'}</Text>
            {copied ? <Text role="status" className="text-sm text-emerald-600 dark:text-emerald-300">{copied}</Text> : null}
          </View>
          {!phone ? <AppButton label="Copy" accessibilityLabel="Copy your ID" variant="outline" size="touch" onPress={copy} /> : null}
        </View>
      </SettingsSection>

      <SettingsSection title="App">
        <View className="min-h-14 flex-row flex-wrap items-center gap-3 px-4 py-2">
          <Text className="min-w-0 flex-1 text-base font-medium text-foreground dark:text-zinc-50">Appearance</Text>
          <AppSegmented touch value={p.theme} onChange={p.setTheme} options={[{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }]} />
        </View>
        <SettingsRow testID="settings-row-reminder" label="Daily reminder" value={p.reminderOn ? 'On' : 'Off'} selected={p.current === 'reminder'} onPress={() => p.open('reminder')} />
        <SettingsRow testID="settings-row-months" label="Months" value={p.activeMonth ? `Active: ${p.activeMonth}` : 'None active'} selected={p.current === 'months'} onPress={() => p.open('months')} />
        <SettingsRow testID="settings-row-import" label="Import from a file" value="Regular costs, catalog items" selected={p.current === 'import'} onPress={() => p.open('import')} />
      </SettingsSection>

      <AppButton label="Sign out" variant="outline" size="touch" className="self-start" textClassName="text-destructive dark:text-red-300" onPress={(e) => signOut.show(e)} />
      <ConfirmSheet
        open={signOut.open}
        onClose={() => signOut.hide()}
        testID="sign-out-sheet"
        title="Sign out"
        message="Sign out of Budgeta on this device?"
        actionLabel="Sign out"
        destructive
        onConfirm={() => signOut.hide(p.onSignOut)}
      />
    </View>
  );
}
