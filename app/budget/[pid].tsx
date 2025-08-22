import {useLocalSearchParams, useRouter} from 'expo-router';
import {useEffect, useMemo, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, Button, Alert} from 'react-native';
import {useAuthUser} from '@/providers/AuthProvider';
import {
    getOrCreatePeriod, watchPeriod, setTargetPct, setPeriodTitle, setPeriodStatus,
    PeriodDoc, PeriodStatus,
} from '@/lib/repo/periods';
import {fmtMoney, parsePct100} from '@/lib/format';
import {EditRow} from '@/components/EditRow';
import {IncomeItem, addIncomeItem, deleteIncomeItem, updateIncomeItem, watchIncomeItems} from '@/lib/repo/income';
import {PlanItem, PlanGroup, addPlanItem, deletePlanItem, updatePlanItem, watchPlanTotals} from '@/lib/repo/plans';

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
        return () => {
            unP();
            unI();
            unM();
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
        Alert.alert('Finalize budget?', 'Mark this budget as DECIDED. It becomes read-only.', [
            {text: 'Cancel'},
            {text: 'Finalize', style: 'destructive', onPress: async () => setPeriodStatus(user.uid, pid, 'DECIDED')},
        ]);
    }

    // CRUD handlers (respect readOnly)
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

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.h1}>{titleText || pid}</Text>
            <View style={styles.rowHeader}>
                <Text style={[styles.badge, readOnly ? styles.badgeDecided : styles.badgeDraft]}>
                    {readOnly ? 'DECIDED' : 'DRAFT'}
                </Text>
                {!readOnly && <Button title="Finalize" onPress={finalize}/>}
            </View>

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
    rowHeader: {flexDirection: 'row', alignItems: 'center', gap: 12},
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
});
