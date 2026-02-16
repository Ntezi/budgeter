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
  useWindowDimensions,
} from 'react-native';
import {useAuthUser} from '@/providers/AuthProvider';
import {EmptyState} from '@/components/EmptyState';
import {Segmented} from '@/components/Segmented';
import {TagPill} from '@/components/TagPill';
import {AccordionSection} from '@/components/AccordionSection';
import {walletTypeOptions, type WalletType} from '@/lib/domain';
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
  listAllAllocations,
  type Allocation,
  watchAllocations,
} from '@/lib/repo/allocations';
import {periodIdFromDate} from '@/lib/repo/periods';
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
  const [selectedPid] = useState(periodIdFromDate());
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [allTimeAllocations, setAllTimeAllocations] = useState<(Allocation & {periodId: string})[]>([]);
  const {width} = useWindowDimensions();
  const isWide = width >= 1100;

  const [dailyReminderEnabled, setDailyReminderEnabled] = useState(false);
  const [dailyReminderEmail, setDailyReminderEmail] = useState('');
  const [dailyReminderHourUtc, setDailyReminderHourUtc] = useState('07');

  const [accountDraft, setAccountDraft] = useState<AccountDraft>({
    name: '',
    type: 'BANK',
    openingBalance: 0,
  });
  useEffect(() => {
    if (!uid) return;
    const unAcc = watchAccounts(uid, setAccounts, {includeArchived: true});
    const unReminder = watchReminderSettings(uid, (settings) => {
      setDailyReminderEnabled(settings.dailyBalanceReminderEnabled === true);
      setDailyReminderEmail(settings.dailyBalanceReminderEmail ?? user?.email ?? '');
      setDailyReminderHourUtc(String(settings.dailyBalanceReminderHourUtc ?? 7).padStart(2, '0'));
    });
    return () => {
      unAcc();
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
  }, [uid, allocations]);

  const allTimeByAccount = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of allTimeAllocations) {
      const amount = map.get(row.accountId) ?? 0;
      map.set(row.accountId, amount + (row.amount || 0));
    }
    return map;
  }, [allTimeAllocations]);

  const allTimeAllocationsByAccount = useMemo(() => {
    const map = new Map<string, (Allocation & {periodId: string})[]>();
    for (const row of allTimeAllocations) {
      const list = map.get(row.accountId) ?? [];
      list.push(row);
      map.set(row.accountId, list);
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
    <ScrollView contentContainerStyle={[styles.container, isWide && styles.containerWide]}>
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
        const allTimeAccountAllocations = allTimeAllocationsByAccount.get(id) ?? [];
        const listAllocations = allTimeAccountAllocations;
        return (
          <AccordionSection
            key={id || row.name}
            title={row.name}
            subtitle={`${fmtMoney(computedBalance)} · ${row.archived ? 'Archived' : 'Active'} · ${fmtMoney(allTime)} allocated`}
          >
            <View style={styles.formBody}>
              <View style={styles.tableRow}>
                <Text style={styles.help}>Type: {row.type ?? 'OTHER'}</Text>
              </View>
              <View style={styles.allocSummary}>
                <Text style={styles.help}>Total allocated</Text>
                <Text style={styles.allocTotal}>{fmtMoney(allTime)}</Text>
              </View>
              {listAllocations.length ? (
                <>
                  <Text style={styles.help}>Items</Text>
                  <View style={styles.allocList}>
                    {listAllocations.map((alloc) => (
                      <View key={alloc.id ?? `${id}-${alloc.accountId}-${alloc.amount}`} style={styles.allocRow}>
                        <View style={styles.allocRowLeft}>
                          <TagPill tag={alloc.tag} />
                          <Text style={styles.allocLabel}>
                            {alloc.sourceItemName ?? alloc.note ?? 'Allocation'}
                          </Text>
                        </View>
                        <Text style={styles.allocAmount}>{fmtMoney(alloc.amount || 0)}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <Text style={styles.help}>No allocations mapped for this period yet.</Text>
              )}
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
  container: {padding: 16, gap: 12, width: '100%'},
  containerWide: {maxWidth: 1100, alignSelf: 'center'},
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
    flexWrap: 'wrap',
  },
  inline: {flexDirection: 'row', gap: 8, flexWrap: 'wrap'},
  balance: {fontSize: 14, fontWeight: '700', color: '#111827'},
  allocSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  allocTotal: {fontSize: 14, fontWeight: '700', color: '#111827'},
  allocList: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 8,
    gap: 6,
    backgroundColor: '#F9FAFB',
  },
  allocRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  allocRowLeft: {flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1},
  allocLabel: {fontSize: 12, color: '#374151', flexShrink: 1},
  allocAmount: {fontSize: 12, fontWeight: '700', color: '#111827'},
  totals: {marginTop: 8, gap: 4},
});
