import {useEffect, useMemo, useState} from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    Pressable,
    Button,
    Alert,
} from 'react-native';
import {useAuthUser} from '@/providers/AuthProvider';
import {periodIdFromDate, type Group} from '@/lib/repo/periods';
import {
    watchTransactions,
    addTransaction,
    setTransaction,
    delTransaction,
    type Tx,
} from '@/lib/repo/transactions';
import {
    watchRecurring,
    generateForPeriod,
    type Recurring,
} from '@/lib/repo/recurring';
import {fmtMoney, parseMoney} from '@/lib/format';
import {Segmented} from '@/components/Segmented';

type Filter = 'ALL' | Group;

export default function TransactionsTab() {
    const user = useAuthUser();
    const uid = user?.uid;
    const pid = periodIdFromDate();

    const [txs, setTxs] = useState<Tx[]>([]);
    const [templates, setTemplates] = useState<Recurring[]>([]);
    const [filter, setFilter] = useState<Filter>('ALL');

    // New transaction draft
    const [draft, setDraft] = useState<Tx>({
        name: '',
        amount: 0,
        group: 'NEED',
        date: `${pid}-01`,
    });

    useEffect(() => {
        if (!uid) return;
        const unTx = watchTransactions(uid, pid, setTxs);
        const unRecur = watchRecurring(uid, setTemplates);
        return () => {
            unTx();
            unRecur();
        };
    }, [uid, pid]);

    const filtered = useMemo(
        () => (filter === 'ALL' ? txs : txs.filter((t) => t.group === filter)),
        [txs, filter]
    );

    const totals = useMemo(() => {
        const acc = {needs: 0, wants: 0, sd: 0, sum: 0};
        for (const t of txs) {
            if (t.group === 'NEED') acc.needs += t.amount || 0;
            else if (t.group === 'WANT') acc.wants += t.amount || 0;
            else acc.sd += t.amount || 0;
        }
        acc.sum = acc.needs + acc.wants + acc.sd;
        return acc;
    }, [txs]);

    async function onAdd() {
        if (!uid) return;
        if (!draft.name || !draft.amount) {
            Alert.alert('Missing info', 'Please enter a name and amount.');
            return;
        }
        await addTransaction(uid, pid, draft);
        setDraft({...draft, name: '', amount: 0}); // keep group/date
    }

    async function onGenerate() {
        if (!uid) return;
        await generateForPeriod(uid, pid, templates);
        Alert.alert('Generated', `Recurring transactions created for ${pid}`);
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.h1}>Transactions</Text>
            <Text style={styles.subtle}>Period: {pid}</Text>

            <View style={styles.card}>
                <Text style={styles.h2}>Totals</Text>
                <Text>Needs: {fmtMoney(totals.needs)}</Text>
                <Text>Wants: {fmtMoney(totals.wants)}</Text>
                <Text>Savings & Debts: {fmtMoney(totals.sd)}</Text>
                <Text style={{fontWeight: '700', marginTop: 4}}>
                    Spent: {fmtMoney(totals.sum)}
                </Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.h2}>Filter</Text>
                <Segmented
                    value={filter}
                    options={[
                        {label: 'All', value: 'ALL'},
                        {label: 'Needs', value: 'NEED'},
                        {label: 'Wants', value: 'WANT'},
                        {label: 'S&D', value: 'SAVINGS_DEBT'},
                    ]}
                    onChange={(v) => setFilter(v as Filter)}
                />
            </View>

            <View style={styles.headerRow}>
                <Text style={styles.h2}>List</Text>
                <Button title={`Generate recurring (${pid})`} onPress={onGenerate}/>
            </View>

            {filtered.map((t) => (
                <TxRow
                    key={t.id}
                    tx={t}
                    onChange={(patch) => Object.assign(t, patch)}
                    onSave={async () => {
                        if (!uid || !t.id) return;
                        await setTransaction(uid, pid, t.id, {
                            name: t.name,
                            amount: t.amount,
                            group: t.group,
                            date: t.date,
                            note: t.note,
                        });
                    }}
                    onDelete={async () => {
                        if (!uid || !t.id) return;
                        await delTransaction(uid, pid, t.id);
                    }}
                />
            ))}

            <View style={[styles.card, {marginTop: 8}]}>
                <Text style={styles.h2}>Add new</Text>
                <TxRow
                    tx={draft}
                    addMode
                    onChange={(patch) => setDraft({...draft, ...patch})}
                    onSave={onAdd}
                />
            </View>
        </ScrollView>
    );
}

function TxRow({
                   tx,
                   onChange,
                   onSave,
                   onDelete,
                   addMode = false,
               }: {
    tx: Tx;
    onChange: (patch: Partial<Tx>) => void;
    onSave: () => void;
    onDelete?: () => void;
    addMode?: boolean;
}) {
    return (
        <View style={styles.rowCard}>
            <View style={styles.rowTop}>
                <TextInput
                    style={[styles.input, {flex: 1}]}
                    placeholder="Name"
                    value={tx.name ?? ''}
                    onChangeText={(t) => onChange({name: t})}
                />
                <TextInput
                    style={[styles.input, {width: 120, textAlign: 'right'}]}
                    keyboardType="numeric"
                    inputMode="decimal"
                    placeholder="0"
                    value={tx.amount ? String(tx.amount) : ''}
                    onChangeText={(t) => onChange({amount: parseMoney(t)})}
                />
            </View>

            <View style={styles.rowMid}>
                <Segmented
                    value={tx.group}
                    options={[
                        {label: 'Need', value: 'NEED'},
                        {label: 'Want', value: 'WANT'},
                        {label: 'S&D', value: 'SAVINGS_DEBT'},
                    ]}
                    onChange={(v) => onChange({group: v as Group})}
                />
                <TextInput
                    style={[styles.input, {width: 150}]}
                    placeholder="YYYY-MM-DD"
                    value={tx.date ?? ''}
                    onChangeText={(t) => onChange({date: t})}
                    autoCapitalize="none"
                    inputMode="numeric"
                />
            </View>

            <View style={styles.actions}>
                {!!onDelete && (
                    <Pressable style={[styles.btn, styles.del]} onPress={onDelete}>
                        <Text style={styles.btnText}>Delete</Text>
                    </Pressable>
                )}
                <Pressable style={[styles.btn, styles.save]} onPress={onSave}>
                    <Text style={styles.btnText}>{addMode ? 'Add' : 'Save'}</Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {padding: 16, gap: 12},
    h1: {fontSize: 22, fontWeight: '700'},
    h2: {fontSize: 16, fontWeight: '700'},
    subtle: {color: '#6B7280'},

    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 4,
    },

    card: {
        backgroundColor: '#fff',
        padding: 12,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,
        gap: 6,
    },

    rowCard: {
        backgroundColor: '#fff',
        padding: 12,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOpacity: 0.03,
        shadowRadius: 6,
        elevation: 1,
        gap: 8,
    },
    rowTop: {flexDirection: 'row', alignItems: 'center', gap: 8},
    rowMid: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        justifyContent: 'space-between',
    },

    input: {
        backgroundColor: '#fff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        paddingHorizontal: 10,
        paddingVertical: 8,
    },

    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
    },
    btn: {paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10},
    save: {backgroundColor: '#10B981'},
    del: {backgroundColor: '#EF4444'},
    btnText: {color: '#fff', fontWeight: '700'},
});
