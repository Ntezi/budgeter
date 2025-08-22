import React from 'react';
import {View, TextInput, Pressable, Text, StyleSheet} from 'react-native';
import {parseMoney} from '@/lib/format';

export function EditRow({
                            name, amount, onChange, onSave, onDelete, addMode = false, disabled = false,
                        }: {
    name: string;
    amount: number;
    onChange: (patch: { name?: string; amount?: number }) => void;
    onSave: () => void;
    onDelete?: () => void;
    addMode?: boolean;
    disabled?: boolean;
}) {
    return (
        <View style={styles.row}>
            <TextInput
                style={[styles.input, {flex: 1}, disabled && styles.ro]}
                placeholder={addMode ? 'Name' : undefined}
                value={name}
                onChangeText={(t) => onChange({name: t})}
                editable={!disabled}
            />
            <TextInput
                style={[styles.input, {width: 120, textAlign: 'right'}, disabled && styles.ro]}
                keyboardType="numeric"
                inputMode="decimal"
                placeholder="0"
                value={String(amount || '')}
                onChangeText={(t) => onChange({amount: parseMoney(t)})}
                editable={!disabled}
            />
            {!disabled && (
                <>
                    <Pressable style={[styles.btn, styles.save]} onPress={onSave}><Text
                        style={styles.btnText}>Save</Text></Pressable>
                    {!!onDelete && <Pressable style={[styles.btn, styles.del]} onPress={onDelete}><Text
                        style={styles.btnText}>Del</Text></Pressable>}
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6},
    input: {
        backgroundColor: '#fff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        paddingHorizontal: 10,
        paddingVertical: 8
    },
    ro: {backgroundColor: '#F3F4F6'},
    btn: {paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8},
    save: {backgroundColor: '#10B981'},
    del: {backgroundColor: '#EF4444'},
    btnText: {color: '#fff', fontWeight: '700'},
});
