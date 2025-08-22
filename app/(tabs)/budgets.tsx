import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, Pressable, Alert} from 'react-native';
import {useAuthUser} from '@/providers/AuthProvider';
import {
    PeriodDoc, watchPeriods, createPeriod,
} from '@/lib/repo/periods';
import {useRouter} from "expo-router";
import {CreateBudgetModal} from "@/components/CreateBudgetModal";
import {FAB} from "@/components/FAB";

export default function BudgetsList() {
    const user = useAuthUser();
    const router = useRouter();
    const [rows, setRows] = useState<(PeriodDoc & { id: string })[]>([]);
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        if (!user) return;
        const un = watchPeriods(user.uid, setRows);
        return () => un();
    }, [user?.uid]);

    async function handleCreate({id, title}: { id: string; title: string }) {
        if (!user) {
            Alert.alert('Not signed in', 'Please wait for authentication to complete.');
            throw new Error('User not ready');
        }
        console.log('[BudgetsList] creating', id, title);
        try {
            await createPeriod(user.uid, id, title);
            console.log('[BudgetsList] created');
            setShowModal(false);
            setTimeout(() => router.push(`/budget/${id}`), 0);
        } catch (e: any) {
            console.error('[BudgetsList] create failed', e);
            Alert.alert('Create failed', e?.message ?? String(e));
            throw e;
        }
    }

    return (
        <View style={{flex: 1}}>
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.h1}>Budgets</Text>

                {rows.map((p) => (
                    <Pressable key={p.id} style={styles.row} onPress={() => router.push(`/budget/${p.id}`)}>
                        <View style={{flex: 1}}>
                            <Text style={styles.title}>{p.title || p.id}</Text>
                            <Text style={styles.sub}>{p.id} • {p.status || 'DRAFT'}</Text>
                        </View>
                        <Text style={[styles.badge, p.status === 'DECIDED' ? styles.badgeDecided : styles.badgeDraft]}>
                            {p.status === 'DECIDED' ? 'View' : 'Edit'}
                        </Text>
                    </Pressable>
                ))}
            </ScrollView>

            <FAB onPress={() => setShowModal(true)}/>
            <CreateBudgetModal visible={showModal} onClose={() => setShowModal(false)} onCreate={handleCreate}/>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {padding: 16, gap: 12},
    h1: {fontSize: 22, fontWeight: '700', marginBottom: 4},
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#fff',
        padding: 12,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1
    },
    title: {fontSize: 16, fontWeight: '700'},
    sub: {color: '#6B7280', marginTop: 2},
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        overflow: 'hidden',
        color: '#111',
        fontWeight: '700'
    },
    badgeDraft: {backgroundColor: '#DBEAFE'},
    badgeDecided: {backgroundColor: '#DCFCE7'},
});