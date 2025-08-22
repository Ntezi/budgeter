import {useEffect, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, Button, Switch} from 'react-native';
import {useAuthUser} from '@/providers/AuthProvider';
import {
    watchRecurring, addRecurring, updateRecurring, deleteRecurring,
    type Recurring, type RecurringFlow, generateForPeriod,
} from '@/lib/repo/recurring';
import {periodIdFromDate} from '@/lib/repo/periods';
import {EditRow} from '@/components/EditRow';
import {Segmented} from '@/components/Segmented';

export default function RecurringTab() {
    const uid = useAuthUser()?.uid;
    const pid = periodIdFromDate();

    const [rows, setRows] = useState<Recurring[]>([]);
    const [draft, setDraft] = useState<Recurring>({
        flow: 'EXPENSE',
        name: '', amount: 0, group: 'NEED', dayOfMonth: 1, active: true,
    });

    useEffect(() => {
        if (!uid) return;
        const un = watchRecurring(uid, setRows);
        return () => un();
    }, [uid]);

    async function saveNew() {
        if (!uid || !draft.name || !draft.amount) return;
        await addRecurring(uid, draft);
        setDraft({...draft, name: '', amount: 0}); // keep flow/group/day
    }

    async function saveRow(r: Recurring) {
        if (!uid || !r.id) return;
        await updateRecurring(uid, r.id, {
            flow: r.flow ?? 'EXPENSE',
            name: r.name,
            amount: r.amount,
            group: r.flow === 'EXPENSE' ? (r.group ?? 'NEED') : undefined,
            dayOfMonth: r.dayOfMonth,
            active: r.active,
        });
    }

    async function delRow(r: Recurring) {
        if (!uid || !r.id) return;
        await deleteRecurring(uid, r.id);
    }

    async function generate() {
        if (!uid) return;
        const res = await generateForPeriod(uid, pid, rows);
        alert(`Generated for ${pid}\nExpenses: ${res.expenseWritten}\nIncome: ${res.incomeWritten}`);
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.h1}>Recurring templates</Text>
            <Text style={styles.help}>Period target: {pid}</Text>

            {rows.map((r) => (
                <View key={r.id} style={styles.card}>
                    {/* Flow: EXPENSE or INCOME */}
                    <Segmented
                        value={(r.flow ?? 'EXPENSE') as RecurringFlow}
                        options={[
                            {label: 'Expense', value: 'EXPENSE'},
                            {label: 'Income', value: 'INCOME'},
                        ]}
                        onChange={(v) => {
                            r.flow = v as RecurringFlow;
                        }}
                    />

                    {/* Group only for Expense */}
                    {(r.flow ?? 'EXPENSE') === 'EXPENSE' && (
                        <Segmented
                            value={r.group ?? 'NEED'}
                            options={[
                                {label: 'Need', value: 'NEED'},
                                {label: 'Want', value: 'WANT'},
                                {label: 'S&D', value: 'SAVINGS_DEBT'},
                            ]}
                            onChange={(v) => {
                                r.group = v as any;
                            }}
                        />
                    )}

                    {/* Name & Amount */}
                    <EditRow
                        name={r.name}
                        amount={r.amount}
                        onChange={(p) => {
                            if ('name' in p) r.name = String(p.name);
                            if ('amount' in p) r.amount = Number(p.amount);
                        }}
                        onSave={() => saveRow(r)}
                        onDelete={() => delRow(r)}
                    />

                    {/* Day + Active */}
                    <View style={styles.row}>
                        <Text>Day of month</Text>
                        <Segmented
                            value={String(r.dayOfMonth)}
                            options={[1, 5, 10, 15, 20, 25, 28].map((d) => ({label: String(d), value: String(d)}))}
                            onChange={(v) => {
                                r.dayOfMonth = Number(v);
                            }}
                        />
                    </View>
                    <View style={styles.row}>
                        <Text>Active</Text>
                        <Switch value={r.active !== false} onValueChange={(v) => {
                            r.active = v;
                            saveRow(r);
                        }}/>
                    </View>
                </View>
            ))}

            {/* Add new */}
            <View style={styles.card}>
                <Text style={styles.h2}>Add new</Text>
                <Segmented
                    value={(draft.flow ?? 'EXPENSE') as RecurringFlow}
                    options={[
                        {label: 'Expense', value: 'EXPENSE'},
                        {label: 'Income', value: 'INCOME'},
                    ]}
                    onChange={(v) => setDraft({...draft, flow: v as RecurringFlow})}
                />

                {(draft.flow ?? 'EXPENSE') === 'EXPENSE' && (
                    <Segmented
                        value={draft.group ?? 'NEED'}
                        options={[
                            {label: 'Need', value: 'NEED'},
                            {label: 'Want', value: 'WANT'},
                            {label: 'S&D', value: 'SAVINGS_DEBT'},
                        ]}
                        onChange={(v) => setDraft({...draft, group: v as any})}
                    />
                )}

                <EditRow
                    addMode
                    name={draft.name}
                    amount={draft.amount}
                    onChange={(p) =>
                        setDraft({
                            ...draft,
                            ...('name' in p ? {name: String(p.name)} : {}),
                            ...('amount' in p ? {amount: Number(p.amount)} : {}),
                        })
                    }
                    onSave={saveNew}
                />

                <View style={styles.row}>
                    <Text>Day of month</Text>
                    <Segmented
                        value={String(draft.dayOfMonth)}
                        options={[1, 5, 10, 15, 20, 25, 28].map((d) => ({label: String(d), value: String(d)}))}
                        onChange={(v) => setDraft({...draft, dayOfMonth: Number(v)})}
                    />
                </View>
                <View style={styles.row}>
                    <Text>Active</Text>
                    <Switch value={draft.active !== false} onValueChange={(v) => setDraft({...draft, active: v})}/>
                </View>

                <Button title={`Generate for ${pid}`} onPress={generate}/>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {padding: 16, gap: 12},
    h1: {fontSize: 22, fontWeight: '700'},
    h2: {fontSize: 16, fontWeight: '700'},
    help: {color: '#6B7280'},
    card: {
        backgroundColor: '#fff',
        padding: 12,
        borderRadius: 12,
        gap: 8,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1
    },
    row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
});
