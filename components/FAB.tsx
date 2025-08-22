import React from 'react';
import {Pressable, Text, StyleSheet} from 'react-native';

export function FAB({onPress}: { onPress: () => void }) {
    return (
        <Pressable style={styles.fab} onPress={onPress} accessibilityRole="button"
                   accessibilityLabel="Create new budget">
            <Text style={styles.plus}>＋</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        right: 24,
        bottom: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#2563EB',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
    },
    plus: {color: '#fff', fontSize: 28, lineHeight: 28, fontWeight: '700'},
});
