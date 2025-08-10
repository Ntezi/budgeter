import React from 'react';
import {Text, View, StyleSheet} from 'react-native';

export function DeltaBadge({diff}: { diff: number }) {
    const positive = diff <= 0; // <= 0 means under or on target (good)
    const bg = positive ? '#EAFBF1' : '#FDEDED';
    const fg = positive ? '#065F46' : '#7F1D1D';
    const sign = diff > 0 ? '+' : '';
    return (
        <View style={[styles.wrap, {backgroundColor: bg, borderColor: fg}]}>
            <Text style={[styles.text, {color: fg}]}>{`${sign}${diff.toFixed(0)}`}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1},
    text: {fontSize: 12, fontWeight: '600'},
});
