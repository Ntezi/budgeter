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
import {
  watchPeriods,
  type PeriodDoc,
  setPeriodStatus,
  createPeriod,
  nextMonthIdFromPeriodId,
  periodIdFromDate,
  periodTitleFromId,
} from '@/lib/repo/periods';
import { seedBudgetForNewPeriod } from '@/lib/repo/recurring';
import { applyAllocationDefaultsForPeriod } from '@/lib/repo/allocations';
import type { WorkspaceMode } from '@/lib/repo/scope';
import type { WorkspaceGroupDef } from '@/lib/repo/workspaces';

export default function SettingsScreen() {
  const user = useAuthUser();
  const { signOut } = useAuth();
  const { theme, setTheme } = useThemeMode();
  const {
    workspaceUid,
    activeWorkspaceId,
    activeWorkspace,
    workspaceMode,
    groupDefs,
    workspaceOptions,
    setActiveWorkspaceId,
    createWorkspace,
    sharedMemberships,
    activePeriodId,
    setActivePeriodId,
  } = useWorkspace();
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
  const [workspaceCreateBusy, setWorkspaceCreateBusy] = useState(false);
  const [workspaceCreateError, setWorkspaceCreateError] = useState('');
  const [workspaceCreateSuccess, setWorkspaceCreateSuccess] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceMode, setNewWorkspaceMode] = useState<WorkspaceMode>('MONTHLY_3_BUCKET');
  const [newWorkspaceTemplate, setNewWorkspaceTemplate] = useState<'WEDDING' | 'NONE'>('WEDDING');
  const [newWorkspaceCurrency, setNewWorkspaceCurrency] = useState('GHS');
  const [newWorkspaceStartDate, setNewWorkspaceStartDate] = useState('');
  const [newWorkspaceEndDate, setNewWorkspaceEndDate] = useState('');
  const [newWorkspaceGroups, setNewWorkspaceGroups] = useState('');

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
    () => workspaceOptions.find((opt) => opt.workspaceId === activeWorkspaceId)?.label || 'My Workspace',
    [activeWorkspaceId, workspaceOptions]
  );

  const workspaceModeOptions = [
    { label: 'Monthly 3-bucket', value: 'MONTHLY_3_BUCKET' },
    { label: 'Event Budget', value: 'EVENT' },
    { label: 'Custom Budget', value: 'CUSTOM' },
  ] as const;

  const workspaceTemplateOptions = [
    { label: 'Wedding preset', value: 'WEDDING' },
    { label: 'Blank event groups', value: 'NONE' },
  ] as const;

  const requiresDateRange = newWorkspaceMode !== 'MONTHLY_3_BUCKET';
  const requiresGroupInput = newWorkspaceMode === 'CUSTOM' || (newWorkspaceMode === 'EVENT' && newWorkspaceTemplate === 'NONE');
  const activePeriodCanRollForward = useMemo(
    () => workspaceMode === 'MONTHLY_3_BUCKET' && Boolean(nextMonthIdFromPeriodId(activePeriodId)),
    [activePeriodId, workspaceMode]
  );

  function parseGroupDefs(input: string): WorkspaceGroupDef[] {
    const out: WorkspaceGroupDef[] = [];
    const seen = new Set<string>();
    input
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((name, index) => {
        const id = name
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 32);
        const safeId = id || `GROUP_${index + 1}`;
        if (seen.has(safeId)) return;
        seen.add(safeId);
        out.push({
          id: safeId,
          name,
          order: out.length,
        });
      });
    return out;
  }

  function isIsoDate(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  async function createWorkspaceFromSettings() {
    if (!user?.uid) return;
    setWorkspaceCreateError('');
    setWorkspaceCreateSuccess('');
    setWorkspaceCreateBusy(true);
    try {
      const name = newWorkspaceName.trim() || (newWorkspaceMode === 'MONTHLY_3_BUCKET' ? 'Monthly Workspace' : 'Workspace');
      const currency = newWorkspaceCurrency.trim().toUpperCase() || 'GHS';
      const startDate = newWorkspaceStartDate.trim();
      const endDate = newWorkspaceEndDate.trim();

      if (requiresDateRange) {
        if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
          throw new Error('Start and end dates are required in YYYY-MM-DD format for Event/Custom workspaces.');
        }
        if (startDate > endDate) {
          throw new Error('Start date must be earlier than or equal to end date.');
        }
      }

      const groupDefs = requiresGroupInput ? parseGroupDefs(newWorkspaceGroups) : undefined;
      if (requiresGroupInput && (!groupDefs || groupDefs.length === 0)) {
        throw new Error('Provide at least one group for this workspace mode.');
      }

      await createWorkspace({
        name,
        mode: newWorkspaceMode,
        currency,
        periodPolicy:
          newWorkspaceMode === 'MONTHLY_3_BUCKET'
            ? { type: 'MONTHLY' }
            : { type: 'DATE_RANGE', startDate, endDate },
        groupDefs,
        template: newWorkspaceMode === 'EVENT' && newWorkspaceTemplate === 'WEDDING' ? 'WEDDING' : undefined,
      });

      const initialPeriodId =
        newWorkspaceMode === 'MONTHLY_3_BUCKET' ? periodIdFromDate() : `evt_${Date.now().toString(36)}`;
      await createPeriod(
        user.uid,
        initialPeriodId,
        newWorkspaceMode === 'MONTHLY_3_BUCKET' ? periodTitleFromId(initialPeriodId) : `${name} Budget`,
        {
          type: newWorkspaceMode === 'MONTHLY_3_BUCKET' ? 'MONTHLY' : newWorkspaceMode === 'EVENT' ? 'EVENT' : 'CUSTOM',
          startDate: requiresDateRange ? startDate : undefined,
          endDate: requiresDateRange ? endDate : undefined,
          mode: newWorkspaceMode,
        }
      );
      await setActivePeriodId(initialPeriodId);

      setWorkspaceCreateSuccess(`Workspace "${name}" created.`);
      setNewWorkspaceName('');
      setNewWorkspaceGroups('');
      if (newWorkspaceMode !== 'MONTHLY_3_BUCKET') {
        setNewWorkspaceStartDate('');
        setNewWorkspaceEndDate('');
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setWorkspaceCreateError(message || 'Failed to create workspace.');
    } finally {
      setWorkspaceCreateBusy(false);
    }
  }

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

  async function closeAndStartNext() {
    if (!workspaceUid || !activePeriodId || isClosingPeriod || !activePeriodCanRollForward) return;

    setIsClosingPeriod(true);
    try {
      await setPeriodStatus(workspaceUid, activePeriodId, 'DECIDED');
      const nextPid = nextMonthIdFromPeriodId(activePeriodId);
      if (!nextPid) throw new Error('Could not determine next period ID.');
      await createPeriod(workspaceUid, nextPid, periodTitleFromId(nextPid));
      try {
        await seedBudgetForNewPeriod(workspaceUid, nextPid);
        await applyAllocationDefaultsForPeriod(workspaceUid, nextPid);
      } catch {}
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
          <Text className="text-base font-semibold text-foreground dark:text-zinc-50">Workspaces & Modes</Text>
          <Text className="text-sm text-muted-foreground dark:text-zinc-400">
            Switch workspace context, pick the active period, and create monthly/event/custom workspaces.
          </Text>
        </View>

        <View className="gap-1">
          <Text className="text-xs uppercase tracking-wide text-muted-foreground dark:text-zinc-400">Available workspaces</Text>
          <View className="flex-row flex-wrap gap-2">
            {workspaceOptions.map((option) => (
              <AppBadge
                key={option.workspaceId}
                label={`${option.label} · ${option.mode}`}
                variant={option.workspaceId === activeWorkspaceId ? 'success' : 'outline'}
              />
            ))}
          </View>
        </View>

        <View className="gap-1">
          <Text className="text-xs uppercase tracking-wide text-muted-foreground dark:text-zinc-400">Active Workspace</Text>
          <DropdownField
            value={activeWorkspaceId || ''}
            options={workspaceOptions.map((option) => ({ label: option.label, value: option.workspaceId }))}
            onChange={(value) => void setActiveWorkspaceId(value)}
            placeholder="Select workspace"
            menuStrategy="inline"
            triggerClassName="bg-background dark:bg-zinc-950 border-border dark:border-zinc-800"
          />
          <Text className="text-xs text-muted-foreground dark:text-zinc-400">Current: {workspaceLabel}</Text>
        </View>

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
        </View>

        <View className="gap-1">
          <Text className="text-xs uppercase tracking-wide text-muted-foreground dark:text-zinc-400">Active groups</Text>
          <View className="flex-row flex-wrap gap-2">
            {groupDefs.map((group) => (
              <AppBadge key={group.id} label={group.name} variant="outline" />
            ))}
          </View>
          {activeWorkspace?.legacyMode ? (
            <Text className="text-xs text-muted-foreground dark:text-zinc-400">
              Legacy workspace uses unfiltered queries so docs without `workspaceId` continue to appear.
            </Text>
          ) : null}
        </View>

        <View className="gap-2 rounded-lg border border-border bg-muted/30 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
          <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Create workspace</Text>
          <AppInput
            value={newWorkspaceName}
            onChangeText={setNewWorkspaceName}
            placeholder="Workspace name"
          />
          <DropdownField
            value={newWorkspaceMode}
            options={[...workspaceModeOptions]}
            onChange={(value) => setNewWorkspaceMode(value as WorkspaceMode)}
            placeholder="Select mode"
            menuStrategy="inline"
            triggerClassName="bg-background dark:bg-zinc-950 border-border dark:border-zinc-800"
          />
          {newWorkspaceMode === 'EVENT' ? (
            <DropdownField
              value={newWorkspaceTemplate}
              options={[...workspaceTemplateOptions]}
              onChange={(value) => setNewWorkspaceTemplate(value as 'WEDDING' | 'NONE')}
              placeholder="Select event template"
              menuStrategy="inline"
              triggerClassName="bg-background dark:bg-zinc-950 border-border dark:border-zinc-800"
            />
          ) : null}
          <AppInput
            value={newWorkspaceCurrency}
            onChangeText={setNewWorkspaceCurrency}
            placeholder="Currency (e.g. GHS, USD)"
            autoCapitalize="characters"
          />
          {requiresDateRange ? (
            <>
              <AppInput
                value={newWorkspaceStartDate}
                onChangeText={setNewWorkspaceStartDate}
                placeholder="Start date (YYYY-MM-DD)"
                autoCapitalize="none"
              />
              <AppInput
                value={newWorkspaceEndDate}
                onChangeText={setNewWorkspaceEndDate}
                placeholder="End date (YYYY-MM-DD)"
                autoCapitalize="none"
              />
            </>
          ) : null}
          {requiresGroupInput ? (
            <AppInput
              value={newWorkspaceGroups}
              onChangeText={setNewWorkspaceGroups}
              placeholder="Groups comma-separated (e.g. Venue,Catering,Attire)"
              autoCapitalize="words"
            />
          ) : null}
          <AppButton onPress={createWorkspaceFromSettings} disabled={workspaceCreateBusy}>
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name={workspaceCreateBusy ? 'loading' : 'briefcase-plus-outline'} size={16} color="#FFFFFF" />
              <Text className="text-sm font-medium text-primary-foreground">{workspaceCreateBusy ? 'Creating...' : 'Create Workspace'}</Text>
            </View>
          </AppButton>
          {workspaceCreateError ? <Text className="text-xs text-destructive">{workspaceCreateError}</Text> : null}
          {workspaceCreateSuccess ? <Text className="text-xs text-emerald-600 dark:text-emerald-300">{workspaceCreateSuccess}</Text> : null}
        </View>
      </AppCard>

      <AppCard className="gap-3 border-border dark:border-zinc-800 bg-card dark:bg-zinc-900">
        <View className="gap-1">
          <Text className="text-base font-semibold text-foreground dark:text-zinc-50">Family Collaboration</Text>
          <Text className="text-sm text-muted-foreground dark:text-zinc-400">Invite members to owner-scoped collaboration.</Text>
        </View>

        <View className="gap-1">
          <Text className="text-xs uppercase tracking-wide text-muted-foreground dark:text-zinc-400">Your Collaborator ID</Text>
          <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{user?.uid ?? '-'}</Text>
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
        <Text className="text-sm text-muted-foreground dark:text-zinc-400">
          Active period: {activePeriodId || 'None selected'}.
        </Text>
        {workspaceMode !== 'MONTHLY_3_BUCKET' ? (
          <Text className="text-xs text-muted-foreground dark:text-zinc-400">
            Close & Start Next is available only in Monthly 3-bucket mode.
          </Text>
        ) : null}
        {activePeriodId && activePeriodCanRollForward ? (
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
