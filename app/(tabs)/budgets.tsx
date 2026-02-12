import {useEffect, useMemo, useState} from 'react';
import {Button, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useRouter} from 'expo-router';
import {useAuthUser} from '@/providers/AuthProvider';
import {
  createPeriod,
  nextMonthMeta,
  periodTitleFromId,
  type PeriodDoc,
  watchPeriods,
} from '@/lib/repo/periods';
import {seedBudgetForNewPeriod} from '@/lib/repo/recurring';
import {applyAllocationDefaultsForPeriod} from '@/lib/repo/allocations';
import {EmptyState} from '@/components/EmptyState';

export default function BudgetsTab() {
  const uid = useAuthUser()?.uid;
  const router = useRouter();
  const next = useMemo(() => nextMonthMeta(), []);
  const [periods, setPeriods] = useState<(PeriodDoc & {id: string})[]>([]);
  const [newPid, setNewPid] = useState(next.id);
  const [newTitle, setNewTitle] = useState(next.title);

  useEffect(() => {
    if (!uid) return;
    return watchPeriods(uid, setPeriods);
  }, [uid]);

  async function createBudget() {
    if (!uid) return;
    const pid = newPid.trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(pid)) return;
    const title = newTitle.trim() || periodTitleFromId(pid);
    const exists = periods.some((row) => row.id === pid);
    await createPeriod(uid, pid, title);
    if (!exists) {
      await seedBudgetForNewPeriod(uid, pid);
      await applyAllocationDefaultsForPeriod(uid, pid);
    }
    router.push(`/budget/${pid}`);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>Budgets</Text>
      <Text style={styles.help}>Monthly periods (spreadsheet-style ledger rows)</Text>

      <View style={styles.card}>
        <Text style={styles.h2}>Create / Open Period</Text>
        <View style={styles.inputRow}>
          <Text style={styles.label}>Period ID</Text>
          <TextInput value={newPid} onChangeText={setNewPid} style={styles.input} placeholder="2026-02" />
        </View>
        <View style={styles.inputRow}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            value={newTitle}
            onChangeText={setNewTitle}
            style={styles.input}
            placeholder="February 2026"
          />
        </View>
        <Button title="Create or Open" onPress={createBudget} />
      </View>

      {!periods.length ? <EmptyState title="No budgets yet" hint="Create your first monthly period above." /> : null}

      {periods.map((p) => (
        <Pressable key={p.id} style={styles.row} onPress={() => router.push(`/budget/${p.id}`)}>
          <View style={{flex: 1}}>
            <Text style={styles.title}>{p.title || p.id}</Text>
            <Text style={styles.sub}>{p.id}</Text>
          </View>
          <View style={[styles.badge, p.status === 'DECIDED' ? styles.done : styles.draft]}>
            <Text style={styles.badgeText}>{p.status === 'DECIDED' ? 'DECIDED' : 'DRAFT'}</Text>
          </View>
        </Pressable>
      ))}
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
    padding: 12,
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  inputRow: {gap: 6},
  label: {fontSize: 12, color: '#6B7280'},
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  row: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {fontSize: 16, fontWeight: '600'},
  sub: {fontSize: 12, color: '#6B7280'},
  badge: {borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4},
  badgeText: {fontSize: 12, fontWeight: '700'},
  draft: {backgroundColor: '#DBEAFE'},
  done: {backgroundColor: '#DCFCE7'},
});
