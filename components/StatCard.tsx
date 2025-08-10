import React from 'react';
import {View, Text, StyleSheet} from 'react-native';

export function StatCard({
                             title,
                             value,
                             subtitle,
                             tone = 'default',
                         }: {
    title: string;
    value: string;
    subtitle?: string;
    tone?: 'default' | 'positive' | 'warning' | 'danger';
}) {
    return (
        <View style={[styles.card, toneStyles[tone]]}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.value}>{value}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        flex: 1,
        padding: 16,
        borderRadius: 16,
        backgroundColor: '#fff',
        gap: 6,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
    },
    title: {fontSize: 14, color: '#555'},
    value: {fontSize: 22, fontWeight: '700'},
    subtitle: {fontSize: 12, color: '#777'},
});

const toneStyles = StyleSheet.create({
    default: {},
    positive: {backgroundColor: '#EAFBF1'},
    warning: {backgroundColor: '#FFF6E5'},
    danger: {backgroundColor: '#FDEDED'},
});
