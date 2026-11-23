import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PageHeader } from '@/components/patterns/PageHeader';
import { SettingsIndex } from '@/components/settings/SettingsIndex';
import { WorkspacePage, SETUPS, type StartingSetup } from '@/components/settings/WorkspacePage';
import { PeoplePage } from '@/components/settings/PeoplePage';
import { ReminderPage } from '@/components/settings/ReminderPage';
import { MonthsPage } from '@/components/settings/MonthsPage';
import { ImportPage } from '@/components/settings/ImportPage';
import type { SettingsPageId } from '@/components/settings/SettingsParts';
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
  nextMonthIdFromPeriodId,
  periodIdFromDate,
  periodTitleFromId,
} from '@/lib/repo/periods';
import { seedBudgetForNewPeriod } from '@/lib/repo/recurring';
import { createPeriodIfAbsent } from '@/lib/repo/periodCreate';
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
  const [newWorkspaceSetup, setNewWorkspaceSetup] = useState<StartingSetup>('MONTHLY');
  const setupDef = SETUPS.find((s) => s.id === newWorkspaceSetup) ?? SETUPS[0];
  const newWorkspaceMode: WorkspaceMode = setupDef.mode;
  const newWorkspaceTemplate = setupDef.template;
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

  async function createWorkspaceFromSettings(): Promise<boolean> {
    if (!user?.uid) return false;
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
      await createPeriodIfAbsent(
        user.uid,
        initialPeriodId,
        {
          title: newWorkspaceMode === 'MONTHLY_3_BUCKET' ? periodTitleFromId(initialPeriodId) : `${name} Budget`,
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
      return true;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setWorkspaceCreateError(message || 'Failed to create workspace.');
      return false;
    } finally {
      setWorkspaceCreateBusy(false);
    }
  }

  async function addMember(): Promise<boolean> {
    if (!user?.uid || !activeWorkspaceOwnerUid) return false;
    const memberUid = memberUidDraft.trim();
    setMemberError('');
    setMemberSuccess('');
    if (!activeWorkspaceOwnedByMe) {
      setMemberError('Only the owner can invite people. Switch to your own workspace to invite.');
      return false;
    }
    if (!memberUid) {
      setMemberError('Enter their ID.');
      return false;
    }
    if (memberUid.includes('/')) {
      setMemberError('That ID is not valid.');
      return false;
    }
    if (memberUid === activeWorkspaceOwnerUid) {
      setMemberSuccess("That's your own ID.");
      return false;
    }
    if (ownedMembers.some((row) => row.memberUid === memberUid && row.status !== 'REMOVED')) {
      setMemberSuccess('This person already shares the household.');
      return false;
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
      setMemberSuccess('Invite sent. They can now pick your household under Settings › Workspace.');
      return true;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setMemberError(message || 'Invite failed. Check your permission and try again.');
      Alert.alert('Invite failed', message || 'Please retry.');
      return false;
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
    setReminderSuccess('Saved');
  }

  async function closeAndStartNext() {
    if (!workspaceUid || !activePeriodId || isClosingPeriod || !activePeriodCanRollForward) return;

    setIsClosingPeriod(true);
    try {
      await setPeriodStatus(workspaceUid, activePeriodId, 'DECIDED');
      const nextPid = nextMonthIdFromPeriodId(activePeriodId);
      if (!nextPid) throw new Error('Could not determine next period ID.');
      const created = await createPeriodIfAbsent(workspaceUid, nextPid, { title: periodTitleFromId(nextPid) });
      if (created.created) {
        try {
          await seedBudgetForNewPeriod(workspaceUid, nextPid);
          await applyAllocationDefaultsForPeriod(workspaceUid, nextPid);
        } catch {}
      }
      await setActivePeriodId(nextPid);
      Alert.alert('Success', `Period ${activePeriodId} closed. ${nextPid} is now active.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to close and start next budget.');
    } finally {
      setIsClosingPeriod(false);
    }
  }

  const { width } = useWindowDimensions();
  const desktop = width >= 1024;
  const router = useRouter();
  const params = useLocalSearchParams<{ page?: string; kind?: string }>();
  const PAGES: SettingsPageId[] = ['workspace', 'people', 'reminder', 'months', 'import'];
  const requested = PAGES.includes(params.page as SettingsPageId) ? (params.page as SettingsPageId) : null;
  // Desktop: index left, the chosen page right (Workspace when none is chosen). Phone/tablet: one or the other.
  const page: SettingsPageId | null = requested ?? (desktop ? 'workspace' : null);
  const open = (next: SettingsPageId) => (desktop ? router.setParams({ page: next }) : router.push(`/settings?page=${next}`));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/settings'));
  const monthTitle = (id: string) => periods.find((x) => x.id === id)?.title || (/^\d{4}-\d{2}$/.test(id) ? periodTitleFromId(id) : id);

  const index = (
    <SettingsIndex
      email={email}
      initials={initials}
      uid={user?.uid ?? ''}
      workspaceLabel={workspaceLabel}
      peopleCount={ownedMembers.length}
      ownedByMe={activeWorkspaceOwnedByMe}
      reminderOn={reminderEnabled}
      activeMonth={activePeriodId ? monthTitle(activePeriodId) : ''}
      theme={theme === 'dark' ? 'dark' : 'light'}
      setTheme={(t) => void setTheme(t)}
      current={desktop ? page : null}
      open={open}
      onSignOut={signOut}
    />
  );

  const subPage =
    page === 'workspace' ? (
      <WorkspacePage
        options={workspaceOptions}
        activeId={activeWorkspaceId}
        activeLegacy={Boolean(activeWorkspace?.legacyMode)}
        onSwitch={(id) => setActiveWorkspaceId(id)}
        create={{
          name: newWorkspaceName, setName: setNewWorkspaceName,
          setup: newWorkspaceSetup, setSetup: setNewWorkspaceSetup,
          currency: newWorkspaceCurrency, setCurrency: setNewWorkspaceCurrency,
          start: newWorkspaceStartDate, setStart: setNewWorkspaceStartDate,
          end: newWorkspaceEndDate, setEnd: setNewWorkspaceEndDate,
          groups: newWorkspaceGroups, setGroups: setNewWorkspaceGroups,
          needsDates: requiresDateRange, needsGroups: requiresGroupInput,
          busy: workspaceCreateBusy, error: workspaceCreateError, success: workspaceCreateSuccess,
          onCreate: createWorkspaceFromSettings,
        }}
        onBack={back}
      />
    ) : page === 'people' ? (
      <PeoplePage
        ownedByMe={activeWorkspaceOwnedByMe}
        members={ownedMembers}
        shared={sharedMemberships}
        activeOwnerUid={workspaceUid}
        uidDraft={memberUidDraft}
        emailDraft={memberEmailDraft}
        setUidDraft={setMemberUidDraft}
        setEmailDraft={setMemberEmailDraft}
        inviteError={memberError}
        inviteResult={memberSuccess}
        onInvite={addMember}
        onRemove={removeMember}
        onBack={back}
      />
    ) : page === 'reminder' ? (
      <ReminderPage
        enabled={reminderEnabled}
        setEnabled={setReminderEnabled}
        email={reminderEmail}
        setEmail={setReminderEmail}
        hour={reminderHour}
        setHour={setReminderHour}
        error={reminderError}
        saved={reminderSuccess}
        onSave={() => void saveReminder()}
        onBack={back}
      />
    ) : page === 'months' ? (
      <MonthsPage
        periods={periods}
        activePeriodId={activePeriodId}
        setActivePeriodId={(id) => void setActivePeriodId(id)}
        canRollForward={activePeriodCanRollForward}
        monthlyMode={workspaceMode === 'MONTHLY_3_BUCKET'}
        closing={isClosingPeriod}
        onCloseAndStartNext={closeAndStartNext}
        onBack={back}
      />
    ) : page === 'import' ? (
      <ImportPage uid={workspaceUid} initialKind={params.kind === 'regular' || params.kind === 'catalog' ? params.kind : undefined} onBack={back} />
    ) : null;

  return (
    <ScrollView className="flex-1 bg-background dark:bg-zinc-950" contentContainerClassName="p-4 pb-12 md:p-6">
      <View className="w-full gap-5 self-center" style={{ maxWidth: desktop ? 1120 : 672 }}>
        <PageHeader title="Settings" />
        {desktop ? (
          <View className="flex-row items-start gap-6">
            <View className="w-80">{index}</View>
            <View className="min-w-0 flex-1">{subPage}</View>
          </View>
        ) : (
          subPage ?? index
        )}
      </View>
    </ScrollView>
  );
}
