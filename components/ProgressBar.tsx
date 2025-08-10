import React from 'react';
import {View, StyleSheet} from 'react-native';

export function ProgressBar({value, target, color = '#10B981'}: { value: number; target: number; color?: string }) {
    const ratio = Math.max(0, Math.min(1, target === 0 ? 0 : value / target));
    return (
        <View style={styles.wrap}>
            <View style={[styles.fill, {width: `${ratio * 100}%`, backgroundColor: color}]}/>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {height: 10, backgroundColor: '#eee', borderRadius: 8, overflow: 'hidden'},
    fill: {height: '100%'},
});