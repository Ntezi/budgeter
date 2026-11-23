import React from 'react';
import { Pressable, Text } from 'react-native';

/** Destructive text action (min 44 px): "Remove from November 2026", "Delete this plan". Confirm happens in the handler. */
export function DangerTextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} className="min-h-11 justify-center self-start rounded-md px-2 hover:bg-muted/50 dark:hover:bg-zinc-800/60">
      <Text className="text-sm font-medium text-destructive dark:text-red-300">{label}</Text>
    </Pressable>
  );
}
