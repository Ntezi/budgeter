import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppBadge } from '@/components/ui/AppBadge';
import { cn } from '@/lib/cn';
import { fmtMoney } from '@/lib/format';
import type { RegularItem } from './types';

type Props = { item: RegularItem; sub: string; warn?: boolean; selected?: boolean; onPress: (e?: unknown) => void };

/** Name left, amount right, one muted line under it; the whole row opens the item (min 56 px). */
export function RegularRow({ item, sub, warn, selected, onPress }: Props) {
  const paused = !item.active;
  return (
    <Pressable
      testID={`regular-row-${item.id}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${fmtMoney(item.amount || 0)}${paused ? ', paused' : ''}, ${sub}`}
      className={cn(
        'min-h-14 flex-row items-center gap-3 px-4 py-2 hover:bg-muted/50 active:bg-muted dark:hover:bg-zinc-800/60',
        selected ? 'bg-muted dark:bg-zinc-800' : undefined
      )}
    >
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text className={cn('min-w-0 shrink text-base font-medium', paused ? 'text-muted-foreground dark:text-zinc-400' : 'text-foreground dark:text-zinc-50')} numberOfLines={1}>
            {item.name}
          </Text>
          {paused ? <AppBadge label="Paused" variant="secondary" /> : null}
        </View>
        <Text className={cn('text-sm', warn ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground dark:text-zinc-400')} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Text
        className={cn('shrink-0 text-base font-semibold', paused ? 'text-muted-foreground dark:text-zinc-400' : 'text-foreground dark:text-zinc-50')}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {fmtMoney(item.amount || 0)}
      </Text>
      <MaterialCommunityIcons name="chevron-right" size={20} color="#717182" />
    </Pressable>
  );
}
