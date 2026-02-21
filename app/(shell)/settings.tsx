import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppBadge } from '@/components/ui/AppBadge';
import { DropdownField } from '@/components/ui/DropdownField';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { useAuth, useAuthUser } from '@/providers/AuthProvider';
import { useThemeMode } from '@/providers/ThemeProvider';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import {
  inviteWorkspaceMember,
  removeWorkspaceMember,
  watchOwnedWorkspaceMembers,
  type WorkspaceMember,
} from '@/lib/repo/collaboration';
import { setReminderSettings, watchReminderSettings } from '@/lib/repo/settings';
import { watchPeriods, type PeriodDoc, setPeriodStatus, createPeriod, periodTitleFromId } from '@/lib/repo/periods';
import { seedBudgetForNewPeriod } from '@/lib/repo/recurring';
import { applyAllocationDefaultsForPeriod } from '@/lib/repo/allocations';

export default function SettingsScreen() {
  const user = useAuthUser();
  const { signOut } = useAuth();
  const { theme, setTheme } = useThemeMode();
  const { workspaceUid, workspaceOptions, setWorkspaceUid, sharedMemberships, activePeriodId, setActivePeriodId } = useWorkspace();
  const activeWorkspaceOwnerUid = workspaceUid ?? user?.uid ?? '';
  const activeWorkspaceOwnedByMe = Boolean(user?.uid && activeWorkspaceOwnerUid === user.uid);

  const [periods, setPeriods] = useState<(PeriodDoc & { id: string })[]>([]);

  useEffect(() => {
    if (!activeWorkspaceOwnerUid) return;
    return watchPeriods(activeWorkspaceOwnerUid, setPeriods);
  }, [activeWorkspaceOwnerUid]);

  const periodOptions = useMemo(
    () => periods.map((p) => ({ label: p.title || p.id, value: p.id })),
    [periods]
  );

  const email = user?.email ?? '(Google user)';
  const initials = (email.split('@')[0] || 'BU').slice(0, 2).toUpperCase();

  const [ownedMembers, setOwnedMembers] = useState<WorkspaceMember[]>([]);
  const [memberUidDraft, setMemberUidDraft] = useState('');
  const [memberEmailDraft, setMemberEmailDraft] = useState('');
  const [memberError, setMemberError] = useState('');
  const [memberSuccess, setMemberSuccess] = useState('');

  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderEmail, setReminderEmail] = useState('');
  const [reminderHour, setReminderHour] = useState('7');
  const [reminderError, setReminderError] = useState('');
  const [reminderSuccess, setReminderSuccess] = useState('');
  const [isClosingPeriod, setIsClosingPeriod] = useState(false);

  useEffect(() => {
    if (!activeWorkspaceOwnerUid || !activeWorkspaceOwnedByMe) {
      setOwnedMembers([]);
      return;
    }
    return watchOwnedWorkspaceMembers(activeWorkspaceOwnerUid, setOwnedMembers);
  }, [activeWorkspaceOwnerUid, activeWorkspaceOwnedByMe]);

  useEffect(() => {
    if (!workspaceUid) return;
    return watchReminderSettings(workspaceUid, (settings) => {
      setReminderEnabled(settings.dailyBalanceReminderEnabled === true);
      setReminderEmail(settings.dailyBalanceReminderEmail || user?.email || '');
      setReminderHour(String(settings.dailyBalanceReminderHourUtc ?? 7));
    });
  }, [workspaceUid, user?.email]);

  const workspaceLabel = useMemo(
    () => workspaceOptions.find((opt) => opt.ownerUid === workspaceUid)?.label || 'My Workspace',
    [workspaceOptions, workspaceUid]
  );

  async function addMember() {
    if (!user?.uid || !activeWorkspaceOwnerUid) return;
    const memberUid = memberUidDraft.trim();
    setMemberError('');
    setMemberSuccess('');
    if (!activeWorkspaceOwnedByMe) {
      setMemberError('Only the workspace owner can invite members. Switch to your own workspace to invite.');
      return;
    }
    if (!memberUid) {
      setMemberError('Collaborator ID is required.');
      return;
    }
    if (memberUid.includes('/')) {
      setMemberError('Collaborator ID is invalid.');
      return;
    }
    if (memberUid === activeWorkspaceOwnerUid) {
      setMemberSuccess('That Collaborator ID is the workspace owner. Enter another person\'s Collaborator ID to invite them.');
      return;
    }
    if (ownedMembers.some((row) => row.memberUid === memberUid && row.status !== 'REMOVED')) {
      setMemberSuccess('This member already has access to the workspace.');
      return;
    }
    try {
      await inviteWorkspaceMember(activeWorkspaceOwnerUid, {
        ownerEmail: user.email ?? '',
        ownerName: email.split('@')[0] || '',
        memberUid,
        memberEmail: memberEmailDraft.trim().toLowerCase(),
      });
      setMemberUidDraft('');
      setMemberEmailDraft('');
      setMemberSuccess('Member added. They can now select your workspace in Settings.');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setMemberError(message || 'Invite failed. Check your permission and try again.');
      Alert.alert('Invite failed', message || 'Please retry.');
    }
  }

  async function removeMember(memberUid: string) {
    if (!activeWorkspaceOwnedByMe || !activeWorkspaceOwnerUid) return;
    await removeWorkspaceMember(activeWorkspaceOwnerUid, memberUid);
  }

  async function saveReminder() {
    if (!workspaceUid) return;
    setReminderError('');
    setReminderSuccess('');
    const emailValue = reminderEmail.trim();
    const hourValue = Number(reminderHour);
    if (reminderEnabled && !emailValue) {
      setReminderError('Reminder email is required when reminders are enabled.');
      return;
    }
    if (!Number.isFinite(hourValue) || hourValue < 0 || hourValue > 23) {
      setReminderError('Hour must be between 0 and 23 UTC.');
      return;
    }
    await setReminderSettings(workspaceUid, {
      dailyBalanceReminderEnabled: reminderEnabled,
      dailyBalanceReminderEmail: emailValue,
      dailyBalanceReminderHourUtc: hourValue,
    });
    setReminderSuccess('Reminder settings saved.');
  }

  function getNextPeriodId(currentPid: string) {
    const [yearRaw, monthRaw] = currentPid.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return '';
    const dt = new Date(year, month - 1, 1);
    dt.setMonth(dt.getMonth() + 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  }

  async function closeAndStartNext() {
    if (!workspaceUid || !activePeriodId || isClosingPeriod) return;

    setIsClosingPeriod(true);
    try {
      await setPeriodStatus(workspaceUid, activePeriodId, 'DECIDED');
      const nextPid = getNextPeriodId(activePeriodId);
      if (!nextPid) throw new Error('Could not determine next period ID.');
      await createPeriod(workspaceUid, nextPid, periodTitleFromId(nextPid));
      try {
        await seedBudgetForNewPeriod(workspaceUid, nextPid);
        await applyAllocationDefaultsForPeriod(workspaceUid, nextPid);
      } catch (e) {}
      await setActivePeriodId(nextPid);
      Alert.alert('Success', `Period ${activePeriodId} closed. ${nextPid} is now active.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to close and start next budget.');
    } finally {
      setIsClosingPeriod(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-background dark:bg-zinc-950" contentContainerClassName="gap-5 pb-8 p-4">
      <View className="gap-1">
        <Text className="text-3xl font-bold text-foreground dark:text-zinc-50">Settings</Text>
        <Text className="text-sm text-muted-foreground dark:text-zinc-400">Manage your account, collaboration, and preferences.</Text>
      </View>

      <AppCard className="gap-3 border-border dark:border-zinc-800 bg-card dark:bg-zinc-900">
        <Text className="text-base font-semibold text-foreground dark:text-zinc-50">Profile</Text>
        <View className="flex-row items-center gap-3">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-muted dark:bg-zinc-800">
            <Text className="text-lg font-semibold text-foreground dark:text-zinc-50">{initials}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{email}</Text>
            <Text className="text-xs text-muted-foreground dark:text-zinc-400">Google account</Text>
          </View>
        </View>
        <AppButton variant="outline" onPress={signOut} className="self-start">
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons name="logout" size={16} color="#D4183D" />
            <Text className="text-sm font-medium text-destructive">Sign Out</Text>
          </View>
        </AppButton>
      </AppCard>

      <AppCard className="gap-3 border-border dark:border-zinc-800 bg-card dark:bg-zinc-900">
        <View className="gap-1">
          <Text className="text-base font-semibold text-foreground dark:text-zinc-50">Family Collaboration</Text>
          <Text className="text-sm text-muted-foreground dark:text-zinc-400">Invite members and switch active workspace.</Text>
        </View>

        <View className="gap-1">
          <Text className="text-xs uppercase tracking-wide text-muted-foreground dark:text-zinc-400">Your Collaborator ID</Text>
          <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{user?.uid ?? '-'}</Text>
        </View>

        <View className="gap-1">
          <Text className="text-xs uppercase tracking-wide text-muted-foreground dark:text-zinc-400">Active Workspace</Text>
          <DropdownField
            value={workspaceUid ?? user?.uid ?? ''}
            options={workspaceOptions.map((option) => ({ label: option.label, value: option.ownerUid }))}
            onChange={(value) => void setWorkspaceUid(value)}
            placeholder="Select workspace"
            menuStrategy="inline"
            triggerClassName="bg-background dark:bg-zinc-950 border-border dark:border-zinc-800"
          />
          <Text className="text-xs text-muted-foreground dark:text-zinc-400">Current: {workspaceLabel}</Text>
        </View>

        <View className="gap-2 rounded-lg border border-border bg-muted/30 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
          <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Invite Member by Collaborator ID</Text>
          {!activeWorkspaceOwnedByMe ? (
            <Text className="text-xs text-muted-foreground dark:text-zinc-400">
              You are viewing a shared workspace. Switch to your own workspace to invite members.
            </Text>
          ) : null}
          <AppInput
            value={memberUidDraft}
            onChangeText={setMemberUidDraft}
            placeholder="Member collaborator UID"
            autoCapitalize="none"
            editable={activeWorkspaceOwnedByMe}
          />
          <AppInput
            value={memberEmailDraft}
            onChangeText={setMemberEmailDraft}
            placeholder="Member email (optional)"
            autoCapitalize="none"
            editable={activeWorkspaceOwnedByMe}
          />
          <AppButton onPress={addMember} className="self-start" disabled={!activeWorkspaceOwnedByMe}>
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name="account-plus-outline" size={16} color="#FFFFFF" />
              <Text className="text-sm font-medium text-primary-foreground">Add Member</Text>
            </View>
          </AppButton>
          {memberError ? <Text className="text-xs text-destructive">{memberError}</Text> : null}
          {memberSuccess ? <Text className="text-xs text-emerald-600 dark:text-emerald-300">{memberSuccess}</Text> : null}
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Members You Manage</Text>
          {ownedMembers.map((member) => (
            <View
              key={member.id}
              className="flex-row items-center justify-between rounded-lg border border-border bg-card px-3 py-2 hover:bg-muted/40 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/55"
            >
              <View className="flex-1">
                <Text className="text-sm font-medium text-foreground dark:text-zinc-50">
                  {member.memberEmail || member.memberName || member.memberUid}
                </Text>
                <Text className="text-xs text-muted-foreground dark:text-zinc-400">{member.memberUid}</Text>
              </View>
              <IconActionButton icon="account-remove-outline" label="Remove member" variant="danger" onPress={() => removeMember(member.memberUid)} />
            </View>
          ))}
          {!ownedMembers.length ? <Text className="text-xs text-muted-foreground dark:text-zinc-400">No members yet.</Text> : null}
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Workspaces Shared With You</Text>
          <View className="flex-row flex-wrap gap-2">
            {sharedMemberships.length ? (
              sharedMemberships.map((row) => (
                <AppBadge
                  key={row.id}
                  label={row.ownerName || row.ownerEmail || row.ownerUid}
                  variant={workspaceUid === row.ownerUid ? 'success' : 'outline'}
                />
              ))
            ) : (
              <Text className="text-xs text-muted-foreground dark:text-zinc-400">No shared workspaces yet.</Text>
            )}
          </View>
        </View>
      </AppCard>

      <AppCard className="gap-3 border-border dark:border-zinc-800 bg-card dark:bg-zinc-900">
        <Text className="text-base font-semibold text-foreground dark:text-zinc-50">Period Management</Text>
        <Text className="text-sm text-muted-foreground dark:text-zinc-400">Manage which period is currently active for accounting and tracking.</Text>
        
        <View className="gap-1">
          <Text className="text-xs uppercase tracking-wide text-muted-foreground dark:text-zinc-400">Active Period</Text>
          <DropdownField
            value={activePeriodId}
            options={periodOptions}
            onChange={(value) => void setActivePeriodId(value)}
            placeholder="Select active period"
            menuStrategy="inline"
            triggerClassName="bg-background dark:bg-zinc-950 border-border dark:border-zinc-800"
          />
          <Text className="text-xs text-muted-foreground dark:text-zinc-400">Account balances reflect this period&apos;s allocations.</Text>
        </View>

        {activePeriodId ? (
          <AppButton onPress={closeAndStartNext} variant="outline" className="mt-2" disabled={isClosingPeriod}>
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name={isClosingPeriod ? "loading" : "calendar-check"} size={18} color="#717182" />
              <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{isClosingPeriod ? 'Closing...' : 'Close & Start Next Budget'}</Text>
            </View>
          </AppButton>
        ) : null}
      </AppCard>

      <AppCard className="gap-3 border-border dark:border-zinc-800 bg-card dark:bg-zinc-900">
        <Text className="text-base font-semibold text-foreground dark:text-zinc-50">Daily Balance Reminder Email</Text>
        <Text className="text-sm text-muted-foreground dark:text-zinc-400">
          Sends one daily reminder email to update account remaining amounts.
        </Text>
        <View className="flex-row items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/40">
          <Text className="text-sm text-muted-foreground dark:text-zinc-50">Enable daily reminder</Text>
          <MaterialCommunityIcons name={reminderEnabled ? 'bell-ring-outline' : 'bell-off-outline'} size={18} color="#717182" />
          <AppButton
            size="sm"
            variant={reminderEnabled ? 'primary' : 'outline'}
            label={reminderEnabled ? 'Enabled' : 'Disabled'}
            onPress={() => setReminderEnabled((prev) => !prev)}
          />
        </View>
        <View className="gap-1">
          <Text className="text-xs uppercase tracking-wide text-muted-foreground dark:text-zinc-400">Email</Text>
          <AppInput
            value={reminderEmail}
            onChangeText={setReminderEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>
        <View className="gap-1">
          <Text className="text-xs uppercase tracking-wide text-muted-foreground dark:text-zinc-400">Hour (UTC)</Text>
          <AppInput value={reminderHour} onChangeText={setReminderHour} placeholder="7" keyboardType="number-pad" />
        </View>
        <View className="flex-row items-center gap-2">
          <AppButton onPress={saveReminder} label="Save Reminder" />
        </View>
        {reminderError ? <Text className="text-xs text-destructive">{reminderError}</Text> : null}
        {reminderSuccess ? <Text className="text-xs text-emerald-600 dark:text-emerald-300">{reminderSuccess}</Text> : null}
      </AppCard>

      <AppCard className="gap-3 border-border dark:border-zinc-800 bg-card dark:bg-zinc-900">
        <Text className="text-base font-semibold text-foreground dark:text-zinc-50">Appearance</Text>
        <Text className="text-sm text-muted-foreground dark:text-zinc-400">Select your preferred color scheme.</Text>
        <View className="flex-row gap-2">
          <AppButton variant={theme === 'light' ? 'primary' : 'outline'} size="sm" onPress={() => void setTheme('light')}>
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name="weather-sunny" size={16} color={theme === 'light' ? '#FFFFFF' : '#717182'} />
              <Text className={theme === 'light' ? 'text-sm font-medium text-white' : 'text-sm font-medium text-foreground dark:text-zinc-50'}>
                Light
              </Text>
            </View>
          </AppButton>
          <AppButton variant={theme === 'dark' ? 'primary' : 'outline'} size="sm" onPress={() => void setTheme('dark')}>
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name="moon-waning-crescent" size={16} color={theme === 'dark' ? '#FFFFFF' : '#717182'} />
              <Text className={theme === 'dark' ? 'text-sm font-medium text-white' : 'text-sm font-medium text-foreground dark:text-zinc-50'}>
                Dark
              </Text>
            </View>
          </AppButton>
        </View>
      </AppCard>
    </ScrollView>
  );
}
