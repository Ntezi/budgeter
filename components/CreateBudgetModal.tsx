import React, {useEffect, useState} from 'react';
import {Modal, View, Text, TextInput, Pressable, StyleSheet} from 'react-native';
import {nextMonthMeta} from '@/lib/repo/periods';

export function CreateBudgetModal({
                                      visible,
                                      onClose,
                                      onCreate,
                                  }: {
    visible: boolean;
    onClose: () => void;
    onCreate: (opts: { id: string; title: string }) => Promise<void> | void; // allow async
}) {
    const [id, setId] = useState('');
    const [title, setTitle] = useState('');
    const [err, setErr] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (visible) {
            const m = nextMonthMeta();
            setId(m.id);
            setTitle(m.title);
            setErr('');
            setSubmitting(false);
        }
    }, [visible]);

    function validate() {
        const ok = /^\d{4}-(0[1-9]|1[0-2])$/.test(id);
        if (!ok) return 'Use YYYY-MM (e.g., 2025-09).';
        if (!title.trim()) return 'Title is required.';
        return '';
    }

    async function handleCreate() {
        console.log('[CreateBudgetModal] Create pressed', {id, title});
        const v = validate();
        if (v) {
            setErr(v);
            return;
        }
        try {
            setSubmitting(true);
            await onCreate({id, title: title.trim()});
            console.log('[CreateBudgetModal] onCreate finished');
        } catch (e: any) {
            console.error('[CreateBudgetModal] onCreate failed', e);
            setErr(e?.message ?? String(e));
            setSubmitting(false);
        }
    }

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.backdrop} pointerEvents="box-none">
                <View style={styles.card}>
                    <Text style={styles.h1}>Create Budget</Text>

                    <Text style={styles.label}>Period ID (YYYY-MM)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="2025-09"
                        value={id}
                        onChangeText={setId}
                        inputMode="numeric"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />

                    <Text style={styles.label}>Title</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="September 2025"
                        value={title}
                        onChangeText={setTitle}
                        autoCapitalize="words"
                    />

                    {!!err && <Text style={styles.err}>{err}</Text>}

                    <View style={styles.actions}>
                        <Pressable style={[styles.btn, styles.secondary]} onPress={onClose} disabled={submitting}>
                            <Text style={styles.btnTextSecondary}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.btn, styles.primary, submitting && {opacity: 0.6}]}
                            onPress={handleCreate}
                            disabled={submitting}
                            testID="create-budget-btn"
                        >
                            <Text style={styles.btnTextPrimary}>{submitting ? 'Creating…' : 'Create'}</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
    },
    card: {width: 420, maxWidth: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10},
    h1: {fontSize: 18, fontWeight: '700'},
    label: {fontSize: 12, color: '#374151'},
    input: {borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8},
    err: {color: '#B91C1C', fontSize: 12},
    actions: {flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6},
    btn: {paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10},
    primary: {backgroundColor: '#2563EB'},
    secondary: {backgroundColor: '#F3F4F6'},
    btnTextPrimary: {color: '#fff', fontWeight: '700'},
    btnTextSecondary: {color: '#111827', fontWeight: '700'},
});
