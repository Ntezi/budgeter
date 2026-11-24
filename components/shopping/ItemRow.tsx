import React, { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';
import { useDense } from '@/lib/shell/density';
import { clampSwipe, isHorizontalSwipe, swipeOutcome, SWIPE_DELETE_WIDTH } from '@/lib/rules/shoppingRemoval';

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
  /** BUDG-42: remove this row (swipe below 1024 px, trash on hover/focus from 1024 px). Absent = not removable. */
  onRemove?: () => void;
  /** Why the row cannot be removed (chef view: added by the household). */
  removeBlockedReason?: string;
  /** BUDG-42 select mode: the row is a checkbox; a tap toggles selection only. */
  selectMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  /** Long-press (touch) enters select mode with this row selected. */
  onLongPress?: () => void;
};

/**
 * One shopping row (BUDG-8 07): 44 px circle = Got it toggle, row tap = item sheet. Ticking never posts money.
 * BUDG-42: select mode (checkbox on the left), swipe left to reveal Delete below 1024 px, trash on hover/focus from 1024 px.
 */
export function ItemRow(props: Props) {
  const { name, qty, sub, amount, subTone = 'muted', got, onToggle, onPress, testID, onRemove, removeBlockedReason, selectMode, selected, onSelect, onLongPress } = props;
  const dense = useDense();
  const [hover, setHover] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const x = useRef(new Animated.Value(0)).current;
  const width = useRef(0);
  const base = useRef(0);
  const dragged = useRef(0); // time of the last swipe; a click right after it is not a tap
  const removeRef = useRef(onRemove);
  removeRef.current = onRemove;
  const swipeOn = Boolean(onRemove) && !dense && !selectMode;

  const settle = (to: number) => {
    base.current = to;
    Animated.timing(x, { toValue: to, duration: 160, useNativeDriver: false }).start();
    setRevealed(to !== 0);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_e, g) => isHorizontalSwipe(g.dx, g.dy),
        onMoveShouldSetPanResponder: (_e, g) => isHorizontalSwipe(g.dx, g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => {
          x.setValue(clampSwipe(base.current + g.dx, width.current));
        },
        onPanResponderRelease: (_e, g) => {
          dragged.current = Date.now();
          const outcome = swipeOutcome(base.current + g.dx, width.current);
          if (outcome === 'delete') {
            Animated.timing(x, { toValue: -width.current, duration: 120, useNativeDriver: false }).start(() => {
              base.current = 0;
              x.setValue(0);
              setRevealed(false);
              removeRef.current?.();
            });
          } else settle(outcome === 'reveal' ? -SWIPE_DELETE_WIDTH : 0);
        },
        onPanResponderTerminate: () => settle(base.current),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const guard = (fn: () => void) => () => {
    if (Date.now() - dragged.current < 350) return;
    if (revealed) return settle(0);
    fn();
  };

  // Long-press on web: pointer timers (the responder-based Pressable long press can miss after a re-render).
  const lp = useRef<{ t: ReturnType<typeof setTimeout> | null; x: number; y: number }>({ t: null, x: 0, y: 0 });
  const lpCancel = () => {
    if (lp.current.t) clearTimeout(lp.current.t);
    lp.current.t = null;
  };
  const webLongPress =
    Platform.OS === 'web' && onLongPress && !dense
      ? ({
          onPointerDown: (e: { clientX: number; clientY: number; button?: number }) => {
            if (e.button) return;
            lpCancel();
            lp.current = {
              x: e.clientX,
              y: e.clientY,
              t: setTimeout(() => {
                lp.current.t = null;
                dragged.current = Date.now() + 400; // swallow the click that follows the release
                onLongPress();
              }, 500),
            };
          },
          onPointerMove: (e: { clientX: number; clientY: number }) => {
            if (Math.abs(e.clientX - lp.current.x) > 10 || Math.abs(e.clientY - lp.current.y) > 10) lpCancel();
          },
          onPointerUp: lpCancel,
          onPointerCancel: lpCancel,
          onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
        } as object)
      : {};

  const blocked = !onRemove && Boolean(removeBlockedReason);
  const showTrash = Boolean(onRemove) && dense && !selectMode;
  const webHover = Platform.OS === 'web' ? ({ onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) } as object) : {};

  if (selectMode) {
    const disabled = blocked || !onSelect;
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
    <View
      testID={testID}
      className="relative overflow-hidden"
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width;
      }}
      {...webHover}
    >
      {swipeOn ? (
        <View className="absolute bottom-0 right-0 top-0 flex-row items-stretch justify-end bg-destructive" style={{ width: '100%' }} aria-hidden={!revealed}>
          <Pressable
            testID="swipe-delete"
            accessibilityRole="button"
            accessibilityLabel={`Delete ${name}`}
            focusable={revealed}
            onPress={() => {
              settle(0);
              onRemove?.();
            }}
            className="items-center justify-center"
            style={{ width: SWIPE_DELETE_WIDTH }}
          >
            <Text className="text-sm font-semibold text-white">Delete</Text>
          </Pressable>
        </View>
      ) : null}
      <Animated.View
        {...(swipeOn ? pan.panHandlers : {})}
        {...webLongPress}
        style={[{ transform: [{ translateX: x }] }, Platform.OS === 'web' && swipeOn ? ({ touchAction: 'pan-y' } as object) : null]}
        className="min-h-11 lg:min-h-9 flex-row items-center gap-1 bg-card pl-2 pr-4 dark:bg-zinc-900"
      >
        <Pressable
          accessibilityRole="checkbox"
          aria-checked={got}
          accessibilityLabel={`${got ? 'Got it' : 'To buy'}: ${name}`}
          onPress={guard(onToggle)}
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
          testID="item-open"
          accessibilityHint="Opens the item"
          onPress={guard(onPress)}
          onLongPress={onLongPress && !dense && Platform.OS !== 'web' ? onLongPress : undefined}
          delayLongPress={500}
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
        {showTrash ? (
          <Pressable
            testID="row-remove"
            accessibilityRole="button"
            accessibilityLabel={`Remove ${name}`}
            onPress={onRemove}
            onFocus={() => setFocusIn(true)}
            onBlur={() => setFocusIn(false)}
            className="h-9 w-9 items-center justify-center rounded-md hover:bg-muted dark:hover:bg-zinc-800"
            style={{ opacity: hover || focusIn ? 1 : 0 }}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={18} color="#d4183d" />
          </Pressable>
        ) : null}
      </Animated.View>
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
