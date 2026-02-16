import React from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';

export function Segmented<T extends string>({
                                                value,
                                                options,
                                                onChange,
                                            }: {
    value: T;
    options: { label: string; value: T }[];
    onChange: (v: T) => void
}) {
    return (
        <View style={styles.row}>
            {options.map((o) => {
                const active = value === o.value;
                return (
                    <Pressable key={o.value} onPress={() => onChange(o.value)}
                               style={[styles.btn, active && styles.active]}>
                        <Text style={[styles.txt, active && styles.activeTxt]}>{o.label}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 10, padding: 4, gap: 4, flexWrap: 'wrap'},
    btn: {flexGrow: 1, minWidth: 120, paddingVertical: 8, borderRadius: 8, alignItems: 'center'},
    active: {backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 1},
    txt: {color: '#4B5563', fontWeight: '600'},
    activeTxt: {color: '#111827'},
});
