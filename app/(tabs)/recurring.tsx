import {useEffect, useMemo, useState} from 'react';
import {Alert, Button, ScrollView, StyleSheet, Switch, Text, TextInput, View} from 'react-native';
import {useRouter} from 'expo-router';
import {useAuthUser} from '@/providers/AuthProvider';
import {
  addRecurring,
  deleteRecurring,
  generateForPeriod,
  importRecurringCsv,
  recurringCsvHeader,
  seedBudgetFromRecurring,
  type Recurring,
  type RecurringFlow,
  updateRecurring,
  watchRecurring,
} from '@/lib/repo/recurring';
import {createPeriod, nextMonthMeta, periodIdFromDate, watchPeriods} from '@/lib/repo/periods';
import {applyAllocationDefaultsForPeriod} from '@/lib/repo/allocations';
import {fmtMoney} from '@/lib/format';
import {EditRow} from '@/components/EditRow';
import {Segmented} from '@/components/Segmented';
import {EmptyState} from '@/components/EmptyState';
import {AccordionSection} from '@/components/AccordionSection';

function stripLegacyBucketNote(note?: string) {
  if (!note) return '';
  const parts = note
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  const cleaned = parts.filter((part) => !part.toLowerCase().startsWith('buckettype='));
  return cleaned.join(' | ');
}

function normalizeNote(note?: string) {
  const cleaned = stripLegacyBucketNote(note).trim();
  return cleaned ? cleaned : undefined;
}

export default function RecurringTab() {
  const router = useRouter();
  const uid = useAuthUser()?.uid;
  const [rows, setRows] = useState<Recurring[]>([]);
  const [periodOptions, setPeriodOptions] = useState<string[]>([]);
  const [selectedPid, setSelectedPid] = useState(periodIdFromDate());
  const [csvText, setCsvText] = useState(recurringCsvHeader);
  const [draft, setDraft] = useState<Recurring>({
    flow: 'EXPENSE',
    name: '',
    amount: 0,
    group: 'NEED',
    dayOfMonth: 1,
    active: true,
  });

  useEffect(() => {
    if (!uid) return;
    const unRows = watchRecurring(uid, setRows);
    const unPeriods = watchPeriods(uid, (periods) => {
      const ids = periods.map((row) => row.id);
      setPeriodOptions(ids.length ? ids.slice(0, 6) : [periodIdFromDate()]);
    });
    return () => {
      unRows();
      unPeriods();
    };
  }, [uid]);

  const periodPickerOptions = useMemo(
    () => periodOptions.map((id) => ({label: id, value: id})),
    [periodOptions]
  );
  const activeRows = useMemo(() => rows.filter((r) => r.active !== false), [rows]);
  const activeTotal = useMemo(() => activeRows.reduce((sum, row) => sum + (row.amount || 0), 0), [activeRows]);
  const activeExpenseCount = useMemo(
    () => activeRows.filter((row) => (row.flow ?? 'EXPENSE') === 'EXPENSE').length,
    [activeRows]
  );
  const activeIncomeCount = useMemo(
    () => activeRows.filter((row) => (row.flow ?? 'EXPENSE') === 'INCOME').length,
    [activeRows]
  );

  useEffect(() => {
    if (!periodOptions.length) return;
    if (!periodOptions.includes(selectedPid)) {
      setSelectedPid(periodOptions[0]);
    }
  }, [periodOptions, selectedPid]);

  async function saveNew() {
    if (!uid || !draft.name || !draft.amount) return;
    await addRecurring(uid, {
      flow: draft.flow ?? 'EXPENSE',
      name: draft.name,
      amount: draft.amount,
      group: draft.flow === 'INCOME' ? undefined : draft.group ?? 'NEED',
      dayOfMonth: draft.dayOfMonth,
      active: draft.active !== false,
      note: normalizeNote(draft.note),
    });
    setDraft((prev) => ({...prev, name: '', amount: 0}));
  }

  async function saveRow(r: Recurring) {
    if (!uid || !r.id) return;
    await updateRecurring(uid, r.id, {
      flow: r.flow ?? 'EXPENSE',
      name: r.name,
      amount: r.amount,
      group: r.flow === 'INCOME' ? undefined : r.group ?? 'NEED',
      dayOfMonth: r.dayOfMonth,
      active: r.active !== false,
      note: normalizeNote(r.note),
    });
  }

  function patchRow(id: string | undefined, patch: Partial<Recurring>) {
    if (!id) return;
    setRows((prev) => prev.map((row) => (row.id === id ? {...row, ...patch} : row)));
  }

  async function delRow(r: Recurring) {
    if (!uid || !r.id) return;
    await deleteRecurring(uid, r.id);
  }

  async function generate() {
    if (!uid) return;
    try {
      const out = await generateForPeriod(uid, selectedPid, rows);
      Alert.alert(
        'Recurring applied',
        `${selectedPid}\nExpenses: ${out.expenseWritten}\nIncome: ${out.incomeWritten}`
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Generate failed', message);
    }
  }

  async function importCsv() {
    if (!uid) return;
    try {
      const count = await importRecurringCsv(uid, csvText);
      Alert.alert('Import complete', `${count} recurring template(s) added.`);
      setCsvText(recurringCsvHeader);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('CSV import failed', message);
    }
  }

  async function createNextBudgetFromRecurring() {
    if (!uid) return;
    const next = nextMonthMeta();
    try {
      await createPeriod(uid, next.id, next.title);
      const out = await seedBudgetFromRecurring(uid, next.id, rows);
      const defaults = await applyAllocationDefaultsForPeriod(uid, next.id);
      Alert.alert(
        'Next budget ready',
        `${next.id}\nPlan rows: ${out.planWritten}\nIncome rows: ${out.incomeWritten}\nDefaults: ${defaults}`
      );
      router.push(`/budget/${next.id}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Create failed', message);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.sheetHeader}>
        <Text style={styles.h1}>Recurring Templates</Text>
        <Text style={styles.help}>Canonical flow for monthly auto-generation.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Generate Into Period</Text>
        <Segmented value={selectedPid} options={periodPickerOptions} onChange={setSelectedPid} />
        <Button title={`Generate transactions for ${selectedPid}`} onPress={generate} />
        <Button title="Create next budget (plan+income) from recurring" onPress={createNextBudgetFromRecurring} />
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.h2}>Templates Summary</Text>
        <Text style={styles.summaryLine}>Active templates: {activeRows.length}</Text>
        <Text style={styles.summaryLine}>Expenses: {activeExpenseCount}</Text>
        <Text style={styles.summaryLine}>Income: {activeIncomeCount}</Text>
        <Text style={styles.summaryLine}>Active amount total: {fmtMoney(activeTotal)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>CSV Import</Text>
        <Text style={styles.help}>
          Header: <Text style={{fontWeight: '700'}}>{recurringCsvHeader}</Text>
        </Text>
        <TextInput
          multiline
          value={csvText}
          onChangeText={setCsvText}
          style={styles.csvInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={recurringCsvHeader}
        />
        <Button title="Import CSV rows" onPress={importCsv} />
      </View>

      {!rows.length ? (
        <EmptyState
          title="No recurring templates yet"
          hint="Add recurring income/expense rules below, then generate into a period."
        />
      ) : null}

      {rows.map((r) => {
        const flow = (r.flow ?? 'EXPENSE') as RecurringFlow;
        return (
          <AccordionSection
            key={r.id}
            title={r.name || '(Unnamed template)'}
            subtitle={`${flow} · ${flow === 'EXPENSE' ? (r.group ?? 'NEED') : '—'} · ${r.active !== false ? 'Active' : 'Paused'} · ${fmtMoney(r.amount || 0)}`}
          >
            <View style={styles.cardBody}>
              <Segmented
                value={flow}
                options={[
                  {label: 'Expense', value: 'EXPENSE'},
                  {label: 'Income', value: 'INCOME'},
                ]}
                onChange={(v) => patchRow(r.id, {flow: v as RecurringFlow})}
              />

              {flow === 'EXPENSE' ? (
                <Segmented
                  value={r.group ?? 'NEED'}
                  options={[
                    {label: 'Need', value: 'NEED'},
                    {label: 'Want', value: 'WANT'},
                    {label: 'S&D', value: 'SAVINGS_DEBT'},
                  ]}
                  onChange={(v) => patchRow(r.id, {group: v as 'NEED' | 'WANT' | 'SAVINGS_DEBT'})}
                />
              ) : null}

              <EditRow
                name={r.name}
                amount={r.amount}
                onChange={(patch) =>
                  patchRow(r.id, {
                    ...('name' in patch ? {name: String(patch.name)} : {}),
                    ...('amount' in patch ? {amount: Number(patch.amount)} : {}),
                  })
                }
                onSave={() => saveRow(r)}
                onDelete={() => delRow(r)}
              />

              <View style={styles.row}>
                <Text>Active</Text>
                <Switch
                  value={r.active !== false}
                  onValueChange={(v) => {
                    patchRow(r.id, {active: v});
                    saveRow({...r, active: v});
                  }}
                />
              </View>

            </View>
          </AccordionSection>
        );
      })}

      <AccordionSection title="Add Template" subtitle="Create a new recurring rule" defaultOpen>
        <View style={styles.cardBody}>
          <Segmented
            value={(draft.flow ?? 'EXPENSE') as RecurringFlow}
            options={[
              {label: 'Expense', value: 'EXPENSE'},
              {label: 'Income', value: 'INCOME'},
            ]}
            onChange={(v) => setDraft((prev) => ({...prev, flow: v as RecurringFlow}))}
          />

          {(draft.flow ?? 'EXPENSE') === 'EXPENSE' ? (
            <Segmented
              value={draft.group ?? 'NEED'}
              options={[
                {label: 'Need', value: 'NEED'},
                {label: 'Want', value: 'WANT'},
                {label: 'S&D', value: 'SAVINGS_DEBT'},
              ]}
              onChange={(v) => setDraft((prev) => ({...prev, group: v as 'NEED' | 'WANT' | 'SAVINGS_DEBT'}))}
            />
          ) : null}

          <EditRow
            addMode
            name={draft.name}
            amount={draft.amount}
            onChange={(patch) =>
              setDraft((prev) => ({
                ...prev,
                ...('name' in patch ? {name: String(patch.name)} : {}),
                ...('amount' in patch ? {amount: Number(patch.amount)} : {}),
              }))
            }
            onSave={saveNew}
          />

          <View style={styles.row}>
            <Text>Active</Text>
            <Switch
              value={draft.active !== false}
              onValueChange={(v) => setDraft((prev) => ({...prev, active: v}))}
            />
          </View>
        </View>
      </AccordionSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {padding: 16, gap: 12},
  sheetHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 10,
    marginBottom: 2,
  },
  h1: {fontSize: 24, fontWeight: '700', letterSpacing: 0.3},
  h2: {fontSize: 16, fontWeight: '700'},
  help: {color: '#6B7280', fontSize: 12},
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  summaryCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  summaryLine: {fontSize: 13, color: '#334155'},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  cardBody: {gap: 8},
  csvInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 120,
    textAlignVertical: 'top',
    fontFamily: 'Menlo',
    fontSize: 12,
  },
});
