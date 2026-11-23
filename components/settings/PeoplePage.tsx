import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { AppSheet, useSheet } from '@/components/patterns/AppSheet';
import { FormField } from '@/components/patterns/FormLayout';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { DangerTextButton } from '@/components/plan/DangerTextButton';
import type { WorkspaceMember } from '@/lib/repo/collaboration';
import { ConfirmSheet, Notice, SettingsPage, SettingsRow, SettingsSection } from './SettingsParts';

type Shared = { id?: string; ownerUid: string; ownerName?: string; ownerEmail?: string };

export function memberLabel(m: Pick<WorkspaceMember, 'memberEmail' | 'memberName' | 'memberUid'>) {
  return m.memberEmail || m.memberName || m.memberUid;
}

/**
 * People (09): members you manage, Invite someone, workspaces shared with you. The invite and remove
 * handlers live in settings.tsx unchanged (same inviteWorkspaceMember input, same deleteDoc on remove).
 */
export function PeoplePage(p: {
  ownedByMe: boolean;
  members: WorkspaceMember[];
  shared: Shared[];
  activeOwnerUid: string | null;
  uidDraft: string;
  emailDraft: string;
  setUidDraft: (v: string) => void;
  setEmailDraft: (v: string) => void;
  inviteError: string;
  inviteResult: string;
  onInvite: () => Promise<boolean>;
  onRemove: (memberUid: string) => Promise<void>;
  onBack: () => void;
}) {
  const invite = useSheet();
  const confirm = useSheet();
  const [target, setTarget] = useState<WorkspaceMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState('');

  async function send() {
    if (busy) return;
    setBusy(true);
    const ok = await p.onInvite();
    setBusy(false);
    if (ok) invite.hide();
  }

  async function remove() {
    if (!target || busy) return;
    setBusy(true);
    setRemoveError('');
    try {
      await p.onRemove(target.memberUid);
      confirm.hide();
    } catch (e: unknown) {
      setRemoveError(e instanceof Error ? e.message : 'Could not remove access. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsPage testID="settings-people" title="People" intro="People here see the whole household. To share one shopping list only, use Share on that list." onBack={p.onBack}>
      {p.ownedByMe ? (
        <AppButton label="Invite someone" size="touch" className="self-start dark:bg-zinc-50" textClassName="dark:text-zinc-900" onPress={(e) => invite.show(e)} />
      ) : (
        <Text className="text-sm text-muted-foreground dark:text-zinc-400">You are in a shared workspace. Switch to your own workspace to invite people.</Text>
      )}
      <Notice kind="ok" text={p.inviteResult && !invite.open ? p.inviteResult : ''} />
      <Notice kind="error" text={removeError} />

      <SettingsSection title="People you share with">
        {p.members.length ? (
          p.members.map((m) => (
            <View key={m.id} className="min-h-14 gap-1 px-4 py-2">
              <View className="min-w-0">
                <Text className="text-base font-medium text-foreground dark:text-zinc-50" style={{ overflowWrap: 'anywhere' } as never}>{memberLabel(m)}</Text>
                <Text className="text-sm text-muted-foreground dark:text-zinc-400">{m.role === 'MEMBER' ? 'Member' : m.role}</Text>
              </View>
              <DangerTextButton
                label={`Remove ${memberLabel(m)}`}
                onPress={() => {
                  setTarget(m);
                  setRemoveError('');
                  confirm.show();
                }}
              />
            </View>
          ))
        ) : (
          <SettingsRow label="No one yet" value={p.ownedByMe ? 'Invite someone to share this household.' : undefined} />
        )}
      </SettingsSection>

      <SettingsSection title="Shared with you">
        {p.shared.length ? (
          p.shared.map((row) => (
            <SettingsRow key={row.id ?? row.ownerUid} label={row.ownerName || row.ownerEmail || row.ownerUid} value={p.activeOwnerUid === row.ownerUid ? 'Open now' : undefined} />
          ))
        ) : (
          <SettingsRow label="No shared households yet" />
        )}
      </SettingsSection>

      <AppSheet
        open={invite.open}
        onClose={() => invite.hide()}
        title="Invite someone"
        testID="invite-sheet"
        footer={<AppButton textClassName="dark:text-zinc-900" label={busy ? 'Sending…' : 'Send invite'} size="touch-lg" className="w-full dark:bg-zinc-50" disabled={busy} onPress={send} />}
      >
        <View className="gap-4">
          <Text className="text-sm text-muted-foreground dark:text-zinc-400">Ask them for the ID under Settings › Your ID for sharing. They will see this whole household.</Text>
          <FormField label="Their ID">
            <AppInput accessibilityLabel="Their ID" value={p.uidDraft} onChangeText={p.setUidDraft} autoCapitalize="none" style={{ height: 44 }} />
          </FormField>
          <FormField label="Their email (optional)">
            <AppInput accessibilityLabel="Their email (optional)" value={p.emailDraft} onChangeText={p.setEmailDraft} autoCapitalize="none" keyboardType="email-address" style={{ height: 44 }} />
          </FormField>
          <Notice kind="error" text={p.inviteError} />
          <Notice kind="info" text={invite.open ? p.inviteResult : ''} />
        </View>
      </AppSheet>

      <ConfirmSheet
        open={confirm.open}
        onClose={() => confirm.hide()}
        testID="remove-member-sheet"
        title="Remove access"
        message={`Remove access for ${target ? memberLabel(target) : ''}? Their past entries stay.`}
        actionLabel="Remove access"
        destructive
        busy={busy}
        onConfirm={remove}
      />
    </SettingsPage>
  );
}
