import React from 'react';
import {View, TextInput, Pressable, Text, StyleSheet} from 'react-native';
import {parseMoney} from '@/lib/format';

export function EditRow({
                            name,
                            amount,
                            onChange,
                            onSave,
                            onDelete,
                            addMode = false,
                            disabled = false,
                            showSave = true,
                            saveLabel,
                        }: {
    name: string;
    amount: number;
    onChange: (patch: { name?: string; amount?: number }) => void;
    onSave: () => void;
    onDelete?: () => void;
    addMode?: boolean;
    disabled?: boolean;
    showSave?: boolean;
    saveLabel?: string;
}) {
    const label = saveLabel ?? (addMode ? 'Add' : 'Save');
    return (
        <View style={styles.row}>
            <TextInput
                style={[styles.input, styles.nameInput, disabled && styles.ro]}
                placeholder={addMode ? 'Name' : undefined}
                value={name}
                onChangeText={(t) => onChange({name: t})}
                editable={!disabled}
            />
            <TextInput
                style={[styles.input, styles.amountInput, disabled && styles.ro]}
                keyboardType="numeric"
                inputMode="decimal"
                placeholder="0"
                value={String(amount || '')}
                onChangeText={(t) => onChange({amount: parseMoney(t)})}
                editable={!disabled}
            />
            {!disabled && (
                <>
                    {showSave ? (
                        <Pressable
                            style={({pressed}) => [styles.btn, styles.save, pressed && styles.btnPressed]}
                            onPress={onSave}
                        >
                            <Text style={styles.btnText}>{label}</Text>
                        </Pressable>
                    ) : null}
                    {!!onDelete && (
                        <Pressable
                            style={({pressed}) => [styles.btn, styles.del, pressed && styles.btnPressed]}
                            onPress={onDelete}
                        >
                            <Text style={styles.btnText}>Del</Text>
                        </Pressable>
                    )}
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6, flexWrap: 'wrap'},
    input: {
        backgroundColor: '#fff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        paddingHorizontal: 10,
        paddingVertical: 8
    },
    nameInput: {flexGrow: 1, minWidth: 160},
    amountInput: {width: 120, minWidth: 120, textAlign: 'right'},
    ro: {backgroundColor: '#F3F4F6'},
    btn: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        minWidth: 64,
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
    },
    save: {backgroundColor: '#10B981'},
    del: {backgroundColor: '#EF4444'},
    btnPressed: {opacity: 0.85},
    btnText: {color: '#fff', fontWeight: '700'},
});
