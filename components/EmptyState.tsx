import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

export function EmptyState({title, hint}: {title: string; hint?: string}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 12,
    gap: 4,
    backgroundColor: '#F9FAFB',
  },
  title: {
    fontWeight: '700',
    color: '#111827',
  },
  hint: {
    color: '#6B7280',
    fontSize: 12,
  },
});

