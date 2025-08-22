import {useLocalSearchParams, useRouter} from 'expo-router';
import {useEffect, useMemo, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, Button, Alert, Platform, Switch} from 'react-native';
import {useAuthUser} from '@/providers/AuthProvider';
import {
    getOrCreatePeriod, watchPeriod, setTargetPct, setPeriodTitle, setPeriodStatus,
    deletePeriod, PeriodDoc, PeriodStatus,
} from '@/lib/repo/periods';
import {fmtMoney, parsePct100} from '@/lib/format';
import {EditRow} from '@/components/EditRow';
import {Segmented} from '@/components/Segmented';
import {
    IncomeItem, addIncomeItem, deleteIncomeItem, updateIncomeItem, watchIncomeItems
} from '@/lib/repo/income';
import {
    PlanItem, PlanGroup, addPlanItem, deletePlanItem, updatePlanItem, watchPlanTotals
} from '@/lib/repo/plans';
import {
    watchRecurring, addRecurring, updateRecurring, deleteRecurring,
    generateForPeriod, type Recurring
} from '@/lib/repo/recurring';

export default function BudgetDetail() {
    const {pid} = useLocalSearchParams<{ pid: string }>();
    const router = useRouter();
    const user = useAuthUser();
    const [titleText, setTitleText] = useState('');
    const [status, setStatus] = useState<PeriodStatus>('DRAFT');

    const [pNeeds, setPNeeds] = useState('50');
    const [pWants, setPWants] = useState('30');
    const [pSd, setPSd] = useState('20');

    const [incomeItems, setIncomeItems] = useState<IncomeItem[]>([]);
    const [incomeTotal, setIncomeTotal] = useState(0);
    const [newIncome, setNewIncome] = useState<IncomeItem>({name: '', amount: 0});

    const [planItems, setPlanItems] = useState<PlanItem[]>([]);
    const [totals, setTotals] = useState({needs: 0, wants: 0, sd: 0});
    const [newPlan, setNewPlan] = useState<PlanItem>({name: '', amount: 0, group: 'NEED'});

    // Recurring templates (global)
    const [recRows, setRecRows] = useState<Recurring[]>([]);
    const [recDraft, setRecDraft] = useState<Recurring>({
        name: '', amount: 0, group: 'NEED', dayOfMonth: 1, active: true,
    });

    const readOnly = status === 'DECIDED';

    useEffect(() => {
        if (!user || !pid) return;
        getOrCreatePeriod(user.uid, pid);
        const unP = watchPeriod(user.uid, pid, (p: PeriodDoc) => {
            setTitleText(p.title ?? '');
            setStatus((p.status as PeriodStatus) ?? 'DRAFT');
            setPNeeds(String(Math.round((p.targetPct?.needs ?? 0.5) * 100)));
            setPWants(String(Math.round((p.targetPct?.wants ?? 0.3) * 100)));
            setPSd(String(Math.round((p.targetPct?.sd ?? 0.2) * 100)));
        });
        const unI = watchIncomeItems(user.uid, pid, (items, total) => {
            setIncomeItems(items);
            setIncomeTotal(total);
        });
        const unM = watchPlanTotals(user.uid, pid, (t, items) => {
            setTotals(t);
            setPlanItems(items);
        });
        const unR = watchRecurring(user.uid, setRecRows);
        return () => {
            unP();
            unI();
            unM();
            unR();
        };
    }, [user?.uid, pid]);

    const pct = useMemo(() => ({
        needs: parsePct100(pNeeds),
        wants: parsePct100(pWants),
        sd: parsePct100(pSd),
    }), [pNeeds, pWants, pSd]);

    const autoTargets = useMemo(() => ({
        needs: incomeTotal * pct.needs,
        wants: incomeTotal * pct.wants,
        sd: incomeTotal * pct.sd,
    }), [incomeTotal, pct]);

    async function saveTitle() {
        if (!user || !pid) return;
        await setPeriodTitle(user.uid, pid, titleText.trim());
    }

    async function saveAutoPct() {
        if (!user || !pid) return;
        await setTargetPct(user.uid, pid, pct);
    }

    async function finalize() {
        if (!user || !pid) return;
        if (Platform.OS === 'web') {
            const ok = window.confirm('Finalize this budget? It will become read-only.');
            if (!ok) return;
            try {
                await setPeriodStatus(user.uid, pid, 'DECIDED');
            } catch (e: any) {
                alert(`Finalize failed: ${e?.message ?? e}`);
            }
            return;
        }
        Alert.alert('Finalize budget?', 'Mark this budget as DECIDED. It becomes read-only.', [
            {text: 'Cancel', style: 'cancel'},
            {
                text: 'Finalize', style: 'destructive', onPress: async () => {
                    try {
                        await setPeriodStatus(user.uid, pid, 'DECIDED');
                    } catch (e: any) {
                        Alert.alert('Error', e?.message ?? String(e));
                    }
                }
            },
        ]);
    }

    async function handleDelete() {
        if (!user || !pid) return;
        if (readOnly) {
            const msg = 'Decided budgets are view-only. Unfinalize support can be added if needed.';
            Platform.OS === 'web' ? alert(msg) : Alert.alert('Blocked', msg);
            return;
        }
        if (Platform.OS === 'web') {
            const ok = window.confirm('Delete this draft budget and all its items? This cannot be undone.');
            if (!ok) return;
            try {
                await deletePeriod(user.uid, pid);
                router.replace('/(tabs)/budgets');
            } catch (e: any) {
                alert(`Delete failed: ${e?.message ?? e}`);
            }
            return;
        }
        Alert.alert('Delete budget?', 'Remove the budget and all items (transactions, income, manual plan).', [
            {text: 'Cancel', style: 'cancel'},
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    try {
                        await deletePeriod(user.uid, pid);
                        router.replace('/(tabs)/budgets');
                    } catch (e: any) {
                        Alert.alert('Delete failed', e?.message ?? String(e));
                    }
                }
            },
        ]);
    }

    // Income CRUD
    const saveNewIncome = async () => {
        if (!user || !pid || readOnly || !newIncome.name || !newIncome.amount) return;
        await addIncomeItem(user.uid, pid, newIncome);
        setNewIncome({name: '', amount: 0});
    };
    const saveIncome = async (it: IncomeItem) => {
        if (!user || !pid || readOnly || !it.id) return;
        await updateIncomeItem(user.uid, pid, it.id, {name: it.name, amount: it.amount});
    };
    const delIncome = async (id?: string) => {
        if (!user || !pid || readOnly || !id) return;
        await deleteIncomeItem(user.uid, pid, id);
    };

    // Plan CRUD
    const saveNewPlan = async () => {
        if (!user || !pid || readOnly || !newPlan.name || !newPlan.amount) return;
        await addPlanItem(user.uid, pid, newPlan);
        setNewPlan({name: '', amount: 0, group: newPlan.group});
    };
    const savePlan = async (it: PlanItem) => {
        if (!user || !pid || readOnly || !it.id) return;
        await updatePlanItem(user.uid, pid, it.id, {name: it.name, amount: it.amount, group: it.group});
    };
    const delPlan = async (id?: string) => {
        if (!user || !pid || readOnly || !id) return;
        await deletePlanItem(user.uid, pid, id);
    };

    // Recurring CRUD (always editable; global templates)
    const saveNewRecurring = async () => {
        if (!user || !recDraft.name || !recDraft.amount) return;
        await addRecurring(user.uid, recDraft);
        setRecDraft({...recDraft, name: '', amount: 0});
    };
    const saveRecurring = async (r: Recurring) => {
        if (!user || !r.id) return;
        await updateRecurring(user.uid, r.id, {
            name: r.name, amount: r.amount, group: r.group, dayOfMonth: r.dayOfMonth, active: r.active,
        });
    };
    const delRecurring = async (r: Recurring) => {
        if (!user || !r.id) return;
        await deleteRecurring(user.uid, r.id);
    };
    const generateRecurringForThisBudget = async () => {
        if (!user || !pid) return;
        try {
            const {expenseWritten, incomeWritten} = await generateForPeriod(user.uid, pid, recRows);
            Alert.alert('Recurring added', `Expenses: ${expenseWritten}\nIncome: ${incomeWritten}`);
        } catch (e: any) {
            Alert.alert('Generate failed', e?.message ?? String(e));
        }
    };

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.h1}>{titleText || pid}</Text>
            <View style={styles.rowHeader}>
                <Text style={[styles.badge, readOnly ? styles.badgeDecided : styles.badgeDraft]}>
                    {readOnly ? 'DECIDED' : 'DRAFT'}
                </Text>
                <View style={{flexDirection: 'row', gap: 10}}>
                    {!readOnly && <Button title="Finalize" onPress={finalize}/>}
                    {!readOnly && <Button title="Delete" color="#EF4444" onPress={handleDelete}/>}
                </View>
            </View>

            {/* Title */}
            <View style={styles.card}>
                <Text style={styles.h2}>Title</Text>
                <EditRow
                    name={titleText}
                    amount={0}
                    onChange={(p) => 'name' in p && setTitleText(String(p.name))}
                    onSave={saveTitle}
                    addMode
                    disabled={readOnly}
                />
            </View>

            {/* Income */}
            <View style={styles.card}>
                <Text style={styles.h2}>Income items</Text>
                {incomeItems.map((it) => (
                    <EditRow
                        key={it.id}
                        name={it.name}
                        amount={it.amount}
                        onChange={(p) => Object.assign(it, p)}
                        onSave={() => saveIncome(it)}
                        onDelete={() => delIncome(it.id)}
                        disabled={readOnly}
                    />
                ))}
                {!readOnly && (
                    <EditRow
                        addMode
                        name={newIncome.name}
                        amount={newIncome.amount}
                        onChange={(p) => setNewIncome({...newIncome, ...p})}
                        onSave={saveNewIncome}
                    />
                )}
                <Text style={styles.help}>Total income: {fmtMoney(incomeTotal)}</Text>
            </View>

            {/* Auto % targets */}
            <View style={styles.card}>
                <Text style={styles.h2}>Auto Targets (by % of total income)</Text>
                <EditRow name="Needs %" amount={Number(pNeeds)}
                         onChange={(p) => p.amount !== undefined && setPNeeds(String(p.amount))} onSave={saveAutoPct}
                         disabled={readOnly}/>
                <EditRow name="Wants %" amount={Number(pWants)}
                         onChange={(p) => p.amount !== undefined && setPWants(String(p.amount))} onSave={saveAutoPct}
                         disabled={readOnly}/>
                <EditRow name="Savings & Debts %" amount={Number(pSd)}
                         onChange={(p) => p.amount !== undefined && setPSd(String(p.amount))} onSave={saveAutoPct}
                         disabled={readOnly}/>
                <Text style={styles.help}>
                    Targets → Needs {fmtMoney(autoTargets.needs)} · Wants {fmtMoney(autoTargets.wants)} ·
                    S&D {fmtMoney(autoTargets.sd)}
                </Text>
            </View>

            {/* Manual plan */}
            <PlanSection title="Needs (manual items)" group="NEED" items={planItems.filter(i => i.group === 'NEED')}
                         onChangeItem={(it, patch) => Object.assign(it, patch)} onSaveItem={savePlan}
                         onDeleteItem={(it) => delPlan(it.id)}
                         newItem={newPlan} setNewItem={setNewPlan} onAddItem={saveNewPlan} total={totals.needs}
                         readOnly={readOnly}/>

            <PlanSection title="Wants (manual items)" group="WANT" items={planItems.filter(i => i.group === 'WANT')}
                         onChangeItem={(it, patch) => Object.assign(it, patch)} onSaveItem={savePlan}
                         onDeleteItem={(it) => delPlan(it.id)}
                         newItem={newPlan} setNewItem={setNewPlan} onAddItem={saveNewPlan} total={totals.wants}
                         readOnly={readOnly}/>

            <PlanSection title="Savings & Debts (manual items)" group="SAVINGS_DEBT"
                         items={planItems.filter(i => i.group === 'SAVINGS_DEBT')}
                         onChangeItem={(it, patch) => Object.assign(it, patch)} onSaveItem={savePlan}
                         onDeleteItem={(it) => delPlan(it.id)}
                         newItem={newPlan} setNewItem={setNewPlan} onAddItem={saveNewPlan} total={totals.sd}
                         readOnly={readOnly}/>

            {/* Recurring templates (global, editable here) */}
            <View style={styles.card}>
                <Text style={styles.h2}>Recurring templates</Text>
                <Text style={styles.help}>These are global templates. Edits here apply to all budgets.</Text>

                {recRows.map((r) => (
                    <View key={r.id} style={{gap: 8}}>
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
                        <EditRow
                            name={r.name}
                            amount={r.amount}
                            onChange={(p) => {
                                if ('name' in p) r.name = String(p.name);
                                if ('amount' in p) r.amount = Number(p.amount);
                            }}
                            onSave={() => saveRecurring(r)}
                            onDelete={() => delRecurring(r)}
                            // Templates remain editable even if budget is decided
                        />
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
                                saveRecurring(r);
                            }}/>
                        </View>
                        <View style={{height: 1, backgroundColor: '#F3F4F6', marginVertical: 6}}/>
                    </View>
                ))}

                {/* Add new template */}
                <Text style={styles.h3}>Add new template</Text>
                <Segmented
                    value={recDraft.group}
                    options={[
                        {label: 'Need', value: 'NEED'},
                        {label: 'Want', value: 'WANT'},
                        {label: 'S&D', value: 'SAVINGS_DEBT'},
                    ]}
                    onChange={(v) => setRecDraft({...recDraft, group: v as any})}
                />
                <EditRow
                    addMode
                    name={recDraft.name}
                    amount={recDraft.amount}
                    onChange={(p) => setRecDraft({
                        ...recDraft,
                        ...('name' in p ? {name: String(p.name)} : {}),
                        ...('amount' in p ? {amount: Number(p.amount)} : {}),
                    })}
                    onSave={saveNewRecurring}
                />
                <View style={styles.row}>
                    <Text>Day of month</Text>
                    <Segmented
                        value={String(recDraft.dayOfMonth)}
                        options={[1, 5, 10, 15, 20, 25, 28].map((d) => ({label: String(d), value: String(d)}))}
                        onChange={(v) => setRecDraft({...recDraft, dayOfMonth: Number(v)})}
                    />
                </View>
                <View style={styles.row}>
                    <Text>Active</Text>
                    <Switch value={recDraft.active !== false}
                            onValueChange={(v) => setRecDraft({...recDraft, active: v})}/>
                </View>

                <View style={{marginTop: 8}}>
                    <Button title={`Generate recurring for ${pid}`} onPress={generateRecurringForThisBudget}
                            disabled={readOnly}/>
                </View>
            </View>
        </ScrollView>
    );
}

function PlanSection({
                         title,
                         group,
                         items,
                         onChangeItem,
                         onSaveItem,
                         onDeleteItem,
                         newItem,
                         setNewItem,
                         onAddItem,
                         total,
                         readOnly,
                     }: {
    title: string;
    group: PlanGroup;
    items: PlanItem[];
    onChangeItem: (it: PlanItem, patch: Partial<PlanItem>) => void;
    onSaveItem: (it: PlanItem) => void;
    onDeleteItem: (it: PlanItem) => void;
    newItem: PlanItem;
    setNewItem: (it: PlanItem) => void;
    onAddItem: () => void;
    total: number;
    readOnly: boolean;
}) {
    return (
        <View style={styles.card}>
            <Text style={styles.h2}>{title}</Text>
            {items.map((it) => (
                <EditRow key={it.id} name={it.name} amount={it.amount}
                         onChange={(p) => onChangeItem(it, p)} onSave={() => onSaveItem(it)}
                         onDelete={() => onDeleteItem(it)} disabled={readOnly}/>
            ))}
            {!readOnly && (
                <EditRow addMode name={newItem.group === group ? newItem.name : ''}
                         amount={newItem.group === group ? newItem.amount : 0}
                         onChange={(p) => setNewItem({...newItem, group, ...p})} onSave={onAddItem}/>
            )}
            <Text style={styles.help}>Subtotal: {fmtMoney(total)}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {padding: 16, gap: 16},
    h1: {fontSize: 22, fontWeight: '700'},
    h2: {fontSize: 16, fontWeight: '700', marginBottom: 8},
    h3: {fontSize: 14, fontWeight: '700', marginTop: 8},
    rowHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        overflow: 'hidden',
        color: '#111',
        fontWeight: '700'
    },
    badgeDraft: {backgroundColor: '#DBEAFE'},
    badgeDecided: {backgroundColor: '#DCFCE7'},
    card: {
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 16,
        gap: 8,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2
    },
    help: {color: '#6B7280', fontSize: 12},
    row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
});
