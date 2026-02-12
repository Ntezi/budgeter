import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {WalletTag} from '@/lib/domain';
import {walletTagColor, walletTagLabel} from '@/lib/domain';

export function TagPill({tag}: {tag: WalletTag}) {
  const tone = walletTagColor[tag];
  return (
    <View style={[styles.wrap, {backgroundColor: tone.bg}]}>
      <Text style={[styles.text, {color: tone.fg}]}>{walletTagLabel[tag]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

