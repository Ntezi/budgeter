import {useEffect, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, Button, Switch} from 'react-native';
import {useAuthUser} from '@/providers/AuthProvider';
import {
    watchRecurring, addRecurring, updateRecurring, deleteRecurring,
    type Recurring, generateForPeriod,
} from '@/lib/repo/recurring';
import {periodIdFromDate} from '@/lib/repo/periods';
import {EditRow} from '@/components/EditRow';
import {Segmented} from '@/components/Segmented';

export default function RecurringTab() {
    const uid = useAuthUser()?.uid;
    const pid = periodIdFromDate();

    const [rows, setRows] = useState<Recurring[]>([]);
    const [draft, setDraft] = useState<Recurring>({
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
        setDraft({...draft, name: '', amount: 0}); // keep group & dayOfMonth
    }

    async function saveRow(r: Recurring) {
        if (!uid || !r.id) return;
        await updateRecurring(uid, r.id, {
            name: r.name,
            amount: r.amount,
            group: r.group,
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
        await generateForPeriod(uid, pid, rows);
        alert(`Generated recurring transactions for ${pid}`);
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.h1}>Recurring (fixed) expenses</Text>
            <Text style={styles.help}>Templates will create transactions for <Text
                style={{fontWeight: '700'}}>{pid}</Text>.</Text>

            {rows.map((r) => (
                <View key={r.id} style={styles.card}>
                    {/* Group */}
                    <Segmented
                        value={r.group}
                        options={[
                            {label: 'Need', value: 'NEED'},
                            {label: 'Want', value: 'WANT'},
                            {label: 'S&D', value: 'SAVINGS_DEBT'},
                        ]}
                        onChange={(v) => {
                            r.group = v as any;
                        }}
                    />

                    {/* Name + Amount (no "• dXX" in the input) */}
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

                    {/* Day of month */}
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

                    {/* Active toggle */}
                    <View style={styles.row}>
                        <Text>Active</Text>
                        <Switch value={r.active} onValueChange={(v) => {
                            r.active = v;
                            saveRow(r);
                        }}/>
                    </View>

                    <Text style={styles.helpSmall}>Tip: Change fields, then press <Text
                        style={{fontWeight: '700'}}>Save</Text>. Day/Group changes are saved when you press Save.</Text>
                </View>
            ))}

            {/* New template */}
            <View style={styles.card}>
                <Text style={styles.h2}>Add new</Text>

                <Segmented
                    value={draft.group}
                    options={[
                        {label: 'Need', value: 'NEED'},
                        {label: 'Want', value: 'WANT'},
                        {label: 'S&D', value: 'SAVINGS_DEBT'},
                    ]}
                    onChange={(v) => setDraft({...draft, group: v as any})}
                />

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
                    <Switch value={draft.active} onValueChange={(v) => setDraft({...draft, active: v})}/>
                </View>
            </View>

            <View style={{marginTop: 8}}>
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
    helpSmall: {color: '#6B7280', fontSize: 12},
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
