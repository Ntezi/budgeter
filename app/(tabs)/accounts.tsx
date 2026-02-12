import {useEffect, useMemo, useState} from 'react';
import {
  Alert,
  Button,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useAuthUser} from '@/providers/AuthProvider';
import {EmptyState} from '@/components/EmptyState';
import {Segmented} from '@/components/Segmented';
import {TagPill} from '@/components/TagPill';
import {AccordionSection} from '@/components/AccordionSection';
import {walletTypeOptions, type WalletTag, type WalletType} from '@/lib/domain';
import {fmtMoney, parseMoney} from '@/lib/format';
import {
  addAccount,
  archiveAccount,
  deleteAccount,
  type Account,
  updateAccount,
  watchAccounts,
} from '@/lib/repo/accounts';
import {
  addAllocation,
  addAllocationDefault,
  applyAllocationDefaultsForPeriod,
  deleteAllocation,
  deleteAllocationDefault,
  listAllAllocations,
  toAllocationTotals,
  type Allocation,
  type AllocationDefault,
  updateAllocation,
  updateAllocationDefault,
  watchAllocationDefaults,
  watchAllocations,
} from '@/lib/repo/allocations';
import {periodIdFromDate, watchPeriods} from '@/lib/repo/periods';
import {setReminderSettings, watchReminderSettings} from '@/lib/repo/settings';

type AccountDraft = {
  name: string;
  type: WalletType;
  openingBalance: number;
};

export default function AccountsTab() {
  const user = useAuthUser();
  const uid = user?.uid;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [selectedPid, setSelectedPid] = useState(periodIdFromDate());
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [defaults, setDefaults] = useState<AllocationDefault[]>([]);
  const [allTimeAllocations, setAllTimeAllocations] = useState<(Allocation & {periodId: string})[]>([]);

  const [dailyReminderEnabled, setDailyReminderEnabled] = useState(false);
  const [dailyReminderEmail, setDailyReminderEmail] = useState('');
  const [dailyReminderHourUtc, setDailyReminderHourUtc] = useState('07');

  const [accountDraft, setAccountDraft] = useState<AccountDraft>({
    name: '',
    type: 'BANK',
    openingBalance: 0,
  });
  const [allocationDraft, setAllocationDraft] = useState<Allocation>({
    accountId: '',
    amount: 0,
    tag: 'NEEDS',
    note: '',
  });
  const [defaultDraft, setDefaultDraft] = useState<AllocationDefault>({
    accountId: '',
    amount: 0,
    tag: 'NEEDS',
    active: true,
  });

  useEffect(() => {
    if (!uid) return;
    const unAcc = watchAccounts(uid, setAccounts, {includeArchived: true});
    const unPeriods = watchPeriods(uid, (rows) => setPeriods(rows.map((row) => row.id)));
    const unDefaults = watchAllocationDefaults(uid, setDefaults);
    const unReminder = watchReminderSettings(uid, (settings) => {
      setDailyReminderEnabled(settings.dailyBalanceReminderEnabled === true);
      setDailyReminderEmail(settings.dailyBalanceReminderEmail ?? user?.email ?? '');
      setDailyReminderHourUtc(String(settings.dailyBalanceReminderHourUtc ?? 7).padStart(2, '0'));
    });
    return () => {
      unAcc();
      unPeriods();
      unDefaults();
      unReminder();
    };
  }, [uid, user?.email]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchAllocations(uid, selectedPid, (rows) => setAllocations(rows));
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid) return;
    listAllAllocations(uid).then(setAllTimeAllocations);
  }, [uid, allocations, defaults]);

  useEffect(() => {
    if (!periods.length) return;
    if (!periods.includes(selectedPid)) {
      setSelectedPid(periods[0]);
    }
  }, [periods, selectedPid]);

  useEffect(() => {
    if (accounts.length && !allocationDraft.accountId) {
      setAllocationDraft((prev) => ({...prev, accountId: accounts[0].id ?? ''}));
    }
    if (accounts.length && !defaultDraft.accountId) {
      setDefaultDraft((prev) => ({...prev, accountId: accounts[0].id ?? ''}));
    }
  }, [accounts, allocationDraft.accountId, defaultDraft.accountId]);

  const activeAccounts = useMemo(() => accounts.filter((row) => !row.archived), [accounts]);
  const accountById = useMemo(
    () =>
      Object.fromEntries(
        accounts
          .filter((row): row is Account & {id: string} => Boolean(row.id))
          .map((row) => [row.id, row])
      ),
    [accounts]
  );
  const accountOptions = useMemo(
    () =>
      activeAccounts
        .filter((row): row is Account & {id: string} => Boolean(row.id))
        .map((row) => ({label: row.name, value: row.id})),
    [activeAccounts]
  );
  const allAccountOptions = useMemo(
    () =>
      accounts
        .filter((row): row is Account & {id: string} => Boolean(row.id))
        .map((row) => ({
          label: row.archived ? `${row.name} (archived)` : row.name,
          value: row.id,
        })),
    [accounts]
  );
  const periodOptions = useMemo(
    () => (periods.length ? periods.slice(0, 6) : [periodIdFromDate()]).map((id) => ({label: id, value: id})),
    [periods]
  );

  const currentTotals = useMemo(() => toAllocationTotals(allocations), [allocations]);

  const allTimeByAccount = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of allTimeAllocations) {
      const amount = map.get(row.accountId) ?? 0;
      map.set(row.accountId, amount + (row.amount || 0));
    }
    return map;
  }, [allTimeAllocations]);

  async function createAccount() {
    if (!uid || !accountDraft.name.trim()) return;
    await addAccount(uid, {
      name: accountDraft.name.trim(),
      type: accountDraft.type,
      openingBalance: accountDraft.openingBalance || 0,
      archived: false,
      currencyCode: 'GHS',
    });
    setAccountDraft((prev) => ({...prev, name: '', openingBalance: 0}));
  }

  async function saveAccountRow(row: Account) {
    if (!uid || !row.id) return;
    await updateAccount(uid, row.id, {
      name: row.name.trim(),
      type: row.type,
      openingBalance: row.openingBalance || 0,
    });
  }

  async function removeAccountRow(row: Account) {
    if (!uid || !row.id) return;
    await deleteAccount(uid, row.id);
  }

  async function addDefaultRow() {
    if (!uid || !defaultDraft.accountId || !defaultDraft.amount) return;
    await addAllocationDefault(uid, {
      accountId: defaultDraft.accountId,
      amount: defaultDraft.amount,
      tag: defaultDraft.tag ?? 'NEEDS',
      active: defaultDraft.active !== false,
    });
    setDefaultDraft((prev) => ({...prev, amount: 0}));
  }

  async function applyDefaultsNow() {
    if (!uid || !selectedPid) return;
    const count = await applyAllocationDefaultsForPeriod(uid, selectedPid, defaults);
    Alert.alert('Defaults applied', `${count} default allocation(s) written to ${selectedPid}.`);
  }

  async function addAllocationRow() {
    if (!uid || !selectedPid || !allocationDraft.accountId || !allocationDraft.amount) return;
    await addAllocation(uid, selectedPid, {
      accountId: allocationDraft.accountId,
      amount: allocationDraft.amount,
      tag: allocationDraft.tag ?? 'NEEDS',
      note: allocationDraft.note ?? '',
    });
    setAllocationDraft((prev) => ({...prev, amount: 0, note: ''}));
  }

  async function saveReminderSettings() {
    if (!uid) return;
    await setReminderSettings(uid, {
      dailyBalanceReminderEnabled: dailyReminderEnabled,
      dailyBalanceReminderEmail: dailyReminderEmail.trim() || user?.email || '',
      dailyBalanceReminderHourUtc: Number(dailyReminderHourUtc) || 7,
    });
    Alert.alert('Reminder saved', 'Reminder settings stored. Cloud function integration is documented in README.');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>Accounts / Wallets</Text>
      <Text style={styles.help}>
        Balance formula (MVP): opening balance + all allocations across periods.
      </Text>
      <AccordionSection
        title="Create Account"
        subtitle="Add a wallet and starting balance"
        defaultOpen
      >
        <View style={styles.formBody}>
          <TextInput
            value={accountDraft.name}
            onChangeText={(name) => setAccountDraft((prev) => ({...prev, name}))}
            style={styles.input}
            placeholder="Wallet name"
          />
          <Segmented
            value={accountDraft.type}
            options={walletTypeOptions.map((value) => ({label: value, value}))}
            onChange={(type) => setAccountDraft((prev) => ({...prev, type: type as WalletType}))}
          />
          <TextInput
            value={String(accountDraft.openingBalance || '')}
            onChangeText={(value) => setAccountDraft((prev) => ({...prev, openingBalance: parseMoney(value)}))}
            style={styles.input}
            inputMode="decimal"
            placeholder="Opening balance"
          />
          <Button title="Add Account" onPress={createAccount} />
        </View>
      </AccordionSection>

      {!accounts.length ? (
        <EmptyState title="No accounts yet" hint="Create at least one account to start monthly dispatch." />
      ) : null}

      {accounts.map((row) => {
        const id = row.id ?? '';
        const allTime = allTimeByAccount.get(id) ?? 0;
        const computedBalance = (row.openingBalance || 0) + allTime;
        const currentPeriodAmount = allocations
          .filter((a) => a.accountId === id)
          .reduce((sum, item) => sum + (item.amount || 0), 0);
        return (
          <AccordionSection
            key={id || row.name}
            title={row.name}
            subtitle={`${fmtMoney(computedBalance)} · ${row.archived ? 'Archived' : 'Active'} · ${fmtMoney(currentPeriodAmount)} this period`}
          >
            <View style={styles.formBody}>
              <View style={styles.tableRow}>
                <Text style={styles.help}>Type: {row.type ?? 'OTHER'}</Text>
              </View>
              <TextInput
                value={row.name}
                onChangeText={(name) =>
                  setAccounts((prev) => prev.map((it) => (it.id === row.id ? {...it, name} : it)))
                }
                style={styles.input}
              />
              <TextInput
                value={String(row.openingBalance || '')}
                onChangeText={(value) =>
                  setAccounts((prev) =>
                    prev.map((it) => (it.id === row.id ? {...it, openingBalance: parseMoney(value)} : it))
                  )
                }
                style={styles.input}
                inputMode="decimal"
              />
              <View style={styles.inline}>
                <Button title="Save" onPress={() => saveAccountRow(row)} />
                <Button
                  title={row.archived ? 'Unarchive' : 'Archive'}
                  onPress={() => row.id && uid && archiveAccount(uid, row.id, !row.archived)}
                />
                <Button title="Delete" color="#B91C1C" onPress={() => removeAccountRow(row)} />
              </View>
            </View>
          </AccordionSection>
        );
      })}

      <View style={styles.card}>
        <Text style={styles.h2}>Allocation Defaults</Text>
        {!accountOptions.length ? <EmptyState title="Need an account first" /> : null}
        {accountOptions.length ? (
          <>
            <Segmented
              value={defaultDraft.accountId || accountOptions[0].value}
              options={accountOptions}
              onChange={(accountId) => setDefaultDraft((prev) => ({...prev, accountId}))}
            />
            <Segmented
              value={defaultDraft.tag ?? 'NEEDS'}
              options={[
                {label: 'Needs', value: 'NEEDS'},
                {label: 'Wants', value: 'WANTS'},
                {label: 'Savings', value: 'SAVINGS'},
              ]}
              onChange={(tag) => setDefaultDraft((prev) => ({...prev, tag: tag as WalletTag}))}
            />
            <TextInput
              style={styles.input}
              value={String(defaultDraft.amount || '')}
              onChangeText={(value) => setDefaultDraft((prev) => ({...prev, amount: parseMoney(value)}))}
              inputMode="decimal"
              placeholder="Default amount"
            />
            <View style={styles.tableRow}>
              <Text>Active</Text>
              <Switch
                value={defaultDraft.active !== false}
                onValueChange={(active) => setDefaultDraft((prev) => ({...prev, active}))}
              />
            </View>
            <Button title="Add default" onPress={addDefaultRow} />
          </>
        ) : null}

        {defaults.map((row) => (
          <AccordionSection
            key={row.id}
            title={accountById[row.accountId]?.name ?? 'Unknown account'}
            subtitle={`${fmtMoney(row.amount || 0)} · ${row.tag} · ${row.active !== false ? 'Active' : 'Paused'}`}
          >
            <View style={styles.formBody}>
              {allAccountOptions.length ? (
                <Segmented
                  value={row.accountId}
                  options={allAccountOptions}
                  onChange={(accountId) =>
                    setDefaults((prev) => prev.map((it) => (it.id === row.id ? {...it, accountId} : it)))
                  }
                />
              ) : null}
              <Segmented
                value={row.tag}
                options={[
                  {label: 'Needs', value: 'NEEDS'},
                  {label: 'Wants', value: 'WANTS'},
                  {label: 'Savings', value: 'SAVINGS'},
                ]}
                onChange={(tag) =>
                  setDefaults((prev) =>
                    prev.map((it) => (it.id === row.id ? {...it, tag: tag as WalletTag} : it))
                  )
                }
              />
              <TextInput
                style={styles.input}
                value={String(row.amount || '')}
                onChangeText={(value) =>
                  setDefaults((prev) =>
                    prev.map((it) => (it.id === row.id ? {...it, amount: parseMoney(value)} : it))
                  )
                }
                inputMode="decimal"
                placeholder="Amount"
              />
              <View style={styles.tableRow}>
                <Text>Active</Text>
                <Switch
                  value={row.active !== false}
                  onValueChange={(active) =>
                    setDefaults((prev) => prev.map((it) => (it.id === row.id ? {...it, active} : it)))
                  }
                />
              </View>
              <View style={styles.inline}>
                <Button
                  title="Save"
                  onPress={() =>
                    row.id &&
                    uid &&
                    updateAllocationDefault(uid, row.id, {
                      accountId: row.accountId,
                      amount: row.amount,
                      tag: row.tag,
                      active: row.active !== false,
                    })
                  }
                />
                <Button
                  title="Delete"
                  color="#B91C1C"
                  onPress={() => row.id && uid && deleteAllocationDefault(uid, row.id)}
                />
              </View>
            </View>
          </AccordionSection>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Dispatch / Allocations</Text>
        <Text style={styles.help}>
          Item-level allocation is now available in each budget screen. Use this section for manual adjustments/defaults.
        </Text>
        <Segmented value={selectedPid} options={periodOptions} onChange={setSelectedPid} />
        <Button title={`Apply defaults to ${selectedPid}`} onPress={applyDefaultsNow} />

        {accountOptions.length ? (
          <>
            <Segmented
              value={allocationDraft.accountId || accountOptions[0].value}
              options={accountOptions}
              onChange={(accountId) => setAllocationDraft((prev) => ({...prev, accountId}))}
            />
            <Segmented
              value={allocationDraft.tag ?? 'NEEDS'}
              options={[
                {label: 'Needs', value: 'NEEDS'},
                {label: 'Wants', value: 'WANTS'},
                {label: 'Savings', value: 'SAVINGS'},
              ]}
              onChange={(tag) => setAllocationDraft((prev) => ({...prev, tag: tag as WalletTag}))}
            />
            <TextInput
              style={styles.input}
              value={String(allocationDraft.amount || '')}
              onChangeText={(value) => setAllocationDraft((prev) => ({...prev, amount: parseMoney(value)}))}
              inputMode="decimal"
              placeholder="Amount"
            />
            <TextInput
              style={styles.input}
              value={allocationDraft.note ?? ''}
              onChangeText={(note) => setAllocationDraft((prev) => ({...prev, note}))}
              placeholder="Note (optional)"
            />
            <Button title="Add allocation" onPress={addAllocationRow} />
          </>
        ) : null}

        {!allocations.length ? (
          <EmptyState title="No allocations for this period" hint="Add allocations or apply defaults." />
        ) : null}

        {allocations.map((row) => (
          <AccordionSection
            key={row.id}
            title={accountById[row.accountId]?.name ?? 'Unknown account'}
            subtitle={`${fmtMoney(row.amount || 0)} · ${row.tag}`}
          >
            <View style={styles.formBody}>
              <View style={styles.tableRow}>
                <TagPill tag={row.tag} />
                <Text style={styles.help}>{row.note ? row.note : 'No note'}</Text>
              </View>
              {allAccountOptions.length ? (
                <Segmented
                  value={row.accountId}
                  options={allAccountOptions}
                  onChange={(accountId) =>
                    setAllocations((prev) => prev.map((it) => (it.id === row.id ? {...it, accountId} : it)))
                  }
                />
              ) : null}
              <Segmented
                value={row.tag}
                options={[
                  {label: 'Needs', value: 'NEEDS'},
                  {label: 'Wants', value: 'WANTS'},
                  {label: 'Savings', value: 'SAVINGS'},
                ]}
                onChange={(tag) =>
                  setAllocations((prev) =>
                    prev.map((it) => (it.id === row.id ? {...it, tag: tag as WalletTag} : it))
                  )
                }
              />
              <TextInput
                style={styles.input}
                value={String(row.amount || '')}
                onChangeText={(value) =>
                  setAllocations((prev) =>
                    prev.map((it) => (it.id === row.id ? {...it, amount: parseMoney(value)} : it))
                  )
                }
                inputMode="decimal"
                placeholder="Amount"
              />
              <TextInput
                style={styles.input}
                value={row.note ?? ''}
                onChangeText={(note) =>
                  setAllocations((prev) => prev.map((it) => (it.id === row.id ? {...it, note} : it)))
                }
                placeholder="Note"
              />
              <View style={styles.inline}>
                <Button
                  title="Save"
                  onPress={() =>
                    uid &&
                    row.id &&
                    updateAllocation(uid, selectedPid, row.id, {
                      accountId: row.accountId,
                      amount: row.amount,
                      tag: row.tag,
                      note: row.note ?? '',
                    })
                  }
                />
                <Button
                  title="Delete"
                  color="#B91C1C"
                  onPress={() => uid && row.id && deleteAllocation(uid, selectedPid, row.id)}
                />
              </View>
            </View>
          </AccordionSection>
        ))}

        <View style={styles.totals}>
          <Text style={styles.h2}>Totals ({selectedPid})</Text>
          <Text>Needs: {fmtMoney(currentTotals.needs)}</Text>
          <Text>Wants: {fmtMoney(currentTotals.wants)}</Text>
          <Text>Savings: {fmtMoney(currentTotals.savings)}</Text>
          <Text style={styles.balance}>Subtotal: {fmtMoney(currentTotals.total)}</Text>
          <Text style={styles.help}>Allocations remain editable even when a budget is DECIDED.</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Daily Balance Reminder (Email)</Text>
        <View style={styles.tableRow}>
          <Text>Enable reminder</Text>
          <Switch value={dailyReminderEnabled} onValueChange={setDailyReminderEnabled} />
        </View>
        <TextInput
          style={styles.input}
          value={dailyReminderEmail}
          onChangeText={setDailyReminderEmail}
          autoCapitalize="none"
          inputMode="email"
          placeholder="Email address"
        />
        <TextInput
          style={styles.input}
          value={dailyReminderHourUtc}
          onChangeText={(v) => setDailyReminderHourUtc(String(parseMoney(v)).padStart(2, '0').slice(0, 2))}
          inputMode="numeric"
          placeholder="UTC hour (0-23)"
        />
        <Button title="Save reminder settings" onPress={saveReminderSettings} />
        <Text style={styles.help}>
          Sending is integration-ready: store settings here, then schedule Cloud Function dispatch from Firestore.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {padding: 16, gap: 12},
  h1: {fontSize: 24, fontWeight: '700'},
  h2: {fontSize: 16, fontWeight: '700'},
  help: {fontSize: 12, color: '#6B7280'},
  card: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rowTitle: {fontSize: 15, fontWeight: '700'},
  rowBox: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  formBody: {gap: 8},
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  inline: {flexDirection: 'row', gap: 8, flexWrap: 'wrap'},
  balance: {fontSize: 14, fontWeight: '700', color: '#111827'},
  totals: {marginTop: 8, gap: 4},
});
