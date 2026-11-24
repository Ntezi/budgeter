import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';

type Props = {
  name: string;
  /** "5 kg", "2 pack": shown next to the name, never inside it (tests find the name alone). */
  qty?: string;
  sub?: string;
  /** Household only; the chef view never passes an amount. */
  amount?: string;
  subTone?: 'muted' | 'warn';
  got: boolean;
  onToggle: () => void;
  onPress: () => void;
  testID?: string;
};

/** One shopping row (BUDG-8 07): 44 px circle = Got it toggle, row tap = item sheet. Ticking never posts money. */
export function ItemRow({ name, qty, sub, amount, subTone = 'muted', got, onToggle, onPress, testID }: Props) {
  return (
    <View testID={testID} className="min-h-11 lg:min-h-9 flex-row items-center gap-1 pl-2 pr-4">
      <Pressable
        accessibilityRole="checkbox"
        aria-checked={got}
        accessibilityLabel={`${got ? 'Got it' : 'To buy'}: ${name}`}
        onPress={onToggle}
        className="h-11 lg:h-9 w-11 lg:w-9 items-center justify-center rounded-full"
      >
        <View
          className={cn(
            'h-6 w-6 items-center justify-center rounded-full border-2',
            got ? 'border-emerald-300 bg-emerald-500 dark:border-emerald-800' : 'border-primary dark:border-zinc-100'
          )}
        >
          {got ? <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" /> : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Opens the item"
        onPress={onPress}
        className="min-h-11 lg:min-h-9 min-w-0 flex-1 flex-row items-center gap-3 py-2"
      >
        <View className="min-w-0 flex-1">
          <View className="min-w-0 flex-row items-baseline gap-2">
            <Text
              numberOfLines={1}
              className={cn('shrink text-sm font-medium text-foreground dark:text-zinc-50', got && 'text-muted-foreground line-through dark:text-zinc-500')}
            >
              {name}
            </Text>
            {qty ? <Text className="shrink-0 text-xs text-muted-foreground dark:text-zinc-400">{qty}</Text> : null}
          </View>
          {sub ? (
            <Text numberOfLines={1} className={cn('text-xs', subTone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground dark:text-zinc-400')}>
              {sub}
            </Text>
          ) : null}
        </View>
        {amount ? (
          <Text className="shrink-0 text-sm font-semibold text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>
            {amount}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

export function qtyLabel(quantity?: number, unit?: string) {
  if (!quantity && !unit) return '';
  if ((quantity || 1) === 1 && !unit) return '';
  return `${quantity || 1}${unit ? ` ${unit}` : ''}`;
}

/** "To buy (3)" / "Got it (2)" section with hairline dividers; Got it can be folded by the user. */
export function ItemSection({
  title,
  count,
  children,
  folded,
  onFold,
  testID,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  folded?: boolean;
  onFold?: () => void;
  testID?: string;
}) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View testID={testID} className="gap-2">
      {onFold ? (
        <Pressable accessibilityRole="button" aria-expanded={!folded} onPress={onFold} className="h-11 lg:h-9 flex-row items-center justify-between px-1">
          <Text className="text-sm font-medium text-muted-foreground dark:text-zinc-400">{`${title} (${count})`}</Text>
          <MaterialCommunityIcons name={folded ? 'chevron-down' : 'chevron-up'} size={20} color="#717182" />
        </Pressable>
      ) : (
        <Text className="px-1 text-sm font-medium text-muted-foreground dark:text-zinc-400">{`${title} (${count})`}</Text>
      )}
      {!folded && rows.length ? (
        <View className="overflow-hidden rounded-xl border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
          {rows.map((row, i) => (
            <React.Fragment key={i}>
              {i > 0 ? <View className="border-t border-border dark:border-zinc-800" /> : null}
              {row}
            </React.Fragment>
          ))}
        </View>
      ) : null}
    </View>
  );
}
