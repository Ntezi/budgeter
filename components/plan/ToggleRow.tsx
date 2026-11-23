import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { cn } from '@/lib/cn';

type Props = { label: string; description?: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void; accessibilityLabel?: string };

/** A whole-row switch (min 48 px tall): the row is the target, the pill only shows the state. */
export function ToggleRow({ label, description, value, disabled, onChange, accessibilityLabel }: Props) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      aria-checked={value}
      disabled={disabled}
      onPress={() => onChange(!value)}
      className={cn('min-h-12 flex-row items-center gap-3 rounded-md', disabled ? 'opacity-60' : undefined)}
    >
      <View className="min-w-0 flex-1">
        <Text className="text-base text-foreground dark:text-zinc-50">{label}</Text>
        {description ? <Text className="text-sm text-muted-foreground dark:text-zinc-400">{description}</Text> : null}
      </View>
      <View className={cn('h-6 w-11 justify-center rounded-full px-0.5', value ? 'bg-primary dark:bg-zinc-50' : 'bg-muted dark:bg-zinc-800')}>
        <View className={cn('h-5 w-5 rounded-full bg-card dark:bg-zinc-900', value ? 'self-end' : 'self-start')} />
      </View>
    </Pressable>
  );
}
