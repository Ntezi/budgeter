import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { AppSheet, useSheet } from '@/components/patterns/AppSheet';
import { FormField } from '@/components/patterns/FormLayout';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import type { WorkspaceMode } from '@/lib/repo/scope';
import { ConfirmSheet, Notice, RadioRow, SettingsPage, SettingsSection } from './SettingsParts';

export type WorkspaceOption = { workspaceId: string; label: string; mode: string; legacyMode?: boolean };
export type StartingSetup = 'MONTHLY' | 'EVENT' | 'WEDDING' | 'CUSTOM';

/** Starting setups map onto the same mode/template pairs the old dropdowns produced. */
export const SETUPS: { id: StartingSetup; label: string; sub: string; mode: WorkspaceMode; template: 'WEDDING' | 'NONE' }[] = [
  { id: 'MONTHLY', label: 'Monthly needs, wants, savings', sub: 'A plan for every month. Most households start here.', mode: 'MONTHLY_3_BUCKET', template: 'NONE' },
  { id: 'EVENT', label: 'Event', sub: 'One budget between two dates, with groups you name.', mode: 'EVENT', template: 'NONE' },
  { id: 'WEDDING', label: 'Wedding', sub: 'An event with wedding groups ready: venue, catering, attire…', mode: 'EVENT', template: 'WEDDING' },
  { id: 'CUSTOM', label: 'Custom', sub: 'Your own groups between two dates.', mode: 'CUSTOM', template: 'NONE' },
];

const MODE_TEXT: Record<string, string> = { MONTHLY_3_BUCKET: 'Monthly', EVENT: 'Event', CUSTOM: 'Custom' };

export function WorkspacePage(p: {
  options: WorkspaceOption[];
  activeId: string | null;
  activeLegacy: boolean;
  onSwitch: (id: string) => Promise<void>;
  create: {
    name: string; setName: (v: string) => void;
    setup: StartingSetup; setSetup: (v: StartingSetup) => void;
    currency: string; setCurrency: (v: string) => void;
    start: string; setStart: (v: string) => void;
    end: string; setEnd: (v: string) => void;
    groups: string; setGroups: (v: string) => void;
    needsDates: boolean; needsGroups: boolean;
    busy: boolean; error: string; success: string;
    onCreate: () => Promise<boolean>;
  };
  onBack: () => void;
}) {
  const createSheet = useSheet();
  const switchSheet = useSheet();
  const [pending, setPending] = useState<WorkspaceOption | null>(null);
  const [switching, setSwitching] = useState(false);
  const c = p.create;
  const label = (o: WorkspaceOption) => (o.legacyMode && o.workspaceId === p.options[0]?.workspaceId ? `${o.label} (existing data)` : o.label);

  return (
    <SettingsPage testID="settings-workspace" title="Workspace" intro="Each workspace has its own plans and accounts. Switching moves no data." onBack={p.onBack}>
      <SettingsSection title="Current workspace">
        {p.options.map((o) => (
          <RadioRow
            key={o.workspaceId}
            label={label(o)}
            sub={MODE_TEXT[o.mode] ?? o.mode}
            checked={o.workspaceId === p.activeId}
            onPress={() => {
              if (o.workspaceId === p.activeId) return;
              setPending(o);
              switchSheet.show();
            }}
          />
        ))}
      </SettingsSection>
      {!p.activeLegacy ? (
        <Text className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          Older records may be under the existing data workspace.
        </Text>
      ) : null}
      <AppButton label="Create a workspace" variant="outline" size="touch" className="self-start" onPress={(e) => createSheet.show(e)} />
      <Notice kind="ok" text={c.success} />

      <ConfirmSheet
        open={switchSheet.open}
        onClose={() => switchSheet.hide()}
        testID="switch-workspace-sheet"
        title="Switch workspace"
        message={`Switch to ${pending ? label(pending) : ''}? You'll see its plans and accounts.`}
        actionLabel="Switch"
        busy={switching}
        onConfirm={async () => {
          if (!pending) return;
          setSwitching(true);
          try {
            await p.onSwitch(pending.workspaceId);
          } finally {
            setSwitching(false);
            switchSheet.hide();
          }
        }}
      />

      <AppSheet
        open={createSheet.open}
        onClose={() => createSheet.hide()}
        title="Create a workspace"
        testID="create-workspace-sheet"
        footer={
          <AppButton
            label={c.busy ? 'Creating…' : 'Create'}
            size="touch-lg"
            className="w-full"
            disabled={c.busy}
            onPress={async () => {
              if (await c.onCreate()) createSheet.hide();
            }}
          />
        }
      >
        <View className="gap-4">
          <FormField label="Name">
            <AppInput accessibilityLabel="Workspace name" value={c.name} onChangeText={c.setName} placeholder="Wedding 2027" />
          </FormField>
          <SettingsSection title="Starting setup">
            {SETUPS.map((s) => (
              <RadioRow key={s.id} label={s.label} sub={s.sub} checked={c.setup === s.id} onPress={() => c.setSetup(s.id)} />
            ))}
          </SettingsSection>
          <FormField label="Currency">
            <AppInput accessibilityLabel="Currency" value={c.currency} onChangeText={c.setCurrency} placeholder="GHS" autoCapitalize="characters" />
          </FormField>
          {c.needsDates ? (
            <View className="flex-row flex-wrap gap-3">
              <View className="min-w-36 flex-1">
                <FormField label="Starts (YYYY-MM-DD)">
                  <AppInput accessibilityLabel="Start date" value={c.start} onChangeText={c.setStart} placeholder="YYYY-MM-DD" autoCapitalize="none" />
                </FormField>
              </View>
              <View className="min-w-36 flex-1">
                <FormField label="Ends (YYYY-MM-DD)">
                  <AppInput accessibilityLabel="End date" value={c.end} onChangeText={c.setEnd} placeholder="YYYY-MM-DD" autoCapitalize="none" />
                </FormField>
              </View>
            </View>
          ) : null}
          {c.needsGroups ? (
            <FormField label="Groups, separated by commas">
              <AppInput accessibilityLabel="Groups" value={c.groups} onChangeText={c.setGroups} placeholder="Venue, Catering, Attire" autoCapitalize="words" />
            </FormField>
          ) : null}
          <Notice kind="error" text={c.error} />
        </View>
      </AppSheet>
    </SettingsPage>
  );
}
