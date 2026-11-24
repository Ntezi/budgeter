import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
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
  /** BUDG-42: the trash button at the end of the row removes the item at once (Undo notice). Absent = not removable. */
  onRemove?: () => void;
  /** Why the row cannot be removed (chef view: added by the household); shown in select mode. */
  removeBlockedReason?: string;
  /** BUDG-42 select mode: the row is a checkbox; a tap toggles selection only. */
  selectMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  /** Long-press enters select mode with this row selected. */
  onLongPress?: () => void;
};

/**
 * One shopping row (BUDG-8 07): 44 px circle = Got it toggle, row tap = item sheet. Ticking never posts money.
 * BUDG-42 v2: the d945df9 row plus one always-visible trash button at the end (44 px below 1024, 36 px from 1024).
 */
export function ItemRow(props: Props) {
  const { name, qty, sub, amount, subTone = 'muted', got, onToggle, onPress, testID, onRemove, removeBlockedReason, selectMode, selected, onSelect, onLongPress } = props;
  // Long-press on web: pointer timers (the responder-based Pressable long press can miss after a re-render).
  const lp = useRef<{ t: ReturnType<typeof setTimeout> | null; x: number; y: number; fired: number }>({ t: null, x: 0, y: 0, fired: 0 });
  const lpCancel = () => {
    if (lp.current.t) clearTimeout(lp.current.t);
    lp.current.t = null;
  };
  useEffect(() => () => lpCancel(), []);
  const webLongPress =
    Platform.OS === 'web' && onLongPress && !selectMode
      ? ({
          onPointerDown: (e: { clientX: number; clientY: number; button?: number }) => {
            if (e.button) return;
            lpCancel();
            lp.current = {
              x: e.clientX,
              y: e.clientY,
              fired: lp.current.fired,
              t: setTimeout(() => {
                lp.current.t = null;
                lp.current.fired = Date.now();
                onLongPress();
              }, 500),
            };
          },
          onPointerMove: (e: { clientX: number; clientY: number }) => {
            if (Math.abs(e.clientX - lp.current.x) > 10 || Math.abs(e.clientY - lp.current.y) > 10) lpCancel();
          },
          onPointerUp: lpCancel,
          onPointerCancel: lpCancel,
        } as object)
      : {};
  /** The click that ends a long-press is not a tap. */
  const tap = (fn: () => void) => () => {
    if (Date.now() - lp.current.fired < 800) return;
    fn();
  };

  if (selectMode) {
    const disabled = !onSelect;
    return (
      <Pressable
        testID={testID}
        accessibilityRole="checkbox"
        aria-checked={Boolean(selected)}
        aria-disabled={disabled}
        disabled={disabled}
        accessibilityLabel={`Select ${name}`}
        onPress={onSelect}
        className={cn('min-h-11 lg:min-h-9 flex-row items-center gap-1 pl-2 pr-4', selected && 'bg-muted dark:bg-zinc-800', disabled && 'opacity-60')}
      >
        <View className="h-11 lg:h-9 w-11 lg:w-9 items-center justify-center">
          <MaterialCommunityIcons name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={selected ? '#22C55E' : '#717182'} />
        </View>
        <View className="min-w-0 flex-1 py-2">
          <View className="min-w-0 flex-row items-baseline gap-2">
            <Text numberOfLines={1} className={cn('shrink text-sm font-medium text-foreground dark:text-zinc-50', got && 'text-muted-foreground line-through dark:text-zinc-500')}>
              {name}
            </Text>
            {qty ? <Text className="shrink-0 text-xs text-muted-foreground dark:text-zinc-400">{qty}</Text> : null}
          </View>
          {disabled && removeBlockedReason ? (
            <Text numberOfLines={1} className="text-xs text-muted-foreground dark:text-zinc-400">{removeBlockedReason}</Text>
          ) : null}
        </View>
      </Pressable>
    );
  }

  return (
    <View testID={testID} className={cn('min-h-11 lg:min-h-9 flex-row items-center gap-1 pl-2', onRemove ? 'pr-1' : 'pr-4')} {...webLongPress}>
      <Pressable
        accessibilityRole="checkbox"
        aria-checked={got}
        accessibilityLabel={`${got ? 'Got it' : 'To buy'}: ${name}`}
        onPress={tap(onToggle)}
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
        testID="item-open"
        accessibilityRole="button"
        accessibilityHint="Opens the item"
        onPress={tap(onPress)}
        onLongPress={onLongPress && Platform.OS !== 'web' ? onLongPress : undefined}
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
      {onRemove ? (
        <Pressable
          testID="row-remove"
          accessibilityRole="button"
          accessibilityLabel={`Remove ${name}`}
          onPress={onRemove}
          className="h-11 lg:h-9 w-11 lg:w-9 shrink-0 items-center justify-center rounded-md hover:bg-muted active:bg-muted dark:hover:bg-zinc-800"
        >
          <MaterialCommunityIcons name="trash-can-outline" size={20} color="#717182" />
        </Pressable>
      ) : null}
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
