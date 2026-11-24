import React, { Children, Fragment, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';
import { useDense } from '@/lib/shell/density';

type Props = {
  title: string;
  sub?: string;
  amount?: string;
  amountClassName?: string;
  left?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
  /** Lines the title may use before it truncates; 0 = wrap freely (for sentences such as Needs-you rows). */
  titleLines?: number;
  /** Lines the muted sub line may use; 0 = wrap freely (when it carries an amount). */
  subLines?: number;
  titleTestID?: string;
};

/** Name left, amount right, one muted line under it; whole row is the target (44 px min below 1024 px; old px-3 py-2 from 1024 px). Old sizes: name and amount text-sm, sub text-xs (BUDG-41). */
export function ListRow({ title, sub, amount, amountClassName, left, onPress, accessibilityLabel, testID, titleLines = 1, titleTestID, subLines = 1 }: Props) {
  // A wrapping title (sentence) takes the full width; its amount drops below it so neither is cut.
  const wrap = titleLines <= 0;
  const dense = useDense();
  const body = (
    <>
      {left}
      <View className="min-w-0 flex-1">
        <Text testID={titleTestID} className="text-sm font-medium text-foreground dark:text-zinc-50" numberOfLines={titleLines > 0 ? titleLines : undefined}>
          {title}
        </Text>
        {sub ? (
          <Text className="text-xs text-muted-foreground dark:text-zinc-400" numberOfLines={subLines > 0 ? subLines : undefined}>
            {sub}
          </Text>
        ) : null}
        {amount && wrap ? (
          <Text className={cn('text-sm font-semibold text-foreground dark:text-zinc-50', amountClassName)} style={{ fontVariant: ['tabular-nums'] }}>
            {amount}
          </Text>
        ) : null}
      </View>
      {amount && !wrap ? (
        <Text className={cn('shrink-0 text-sm font-semibold text-foreground dark:text-zinc-50', amountClassName)} style={{ fontVariant: ['tabular-nums'] }}>
          {amount}
        </Text>
      ) : null}
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={18} color="#717182" /> : null}
    </>
  );
  const cls = cn('flex-row items-center gap-3 py-2', dense ? 'min-h-9 px-3' : 'min-h-11 lg:min-h-9 px-4');
  if (!onPress) return <View testID={testID} className={cls}>{body}</View>;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, sub, amount].filter(Boolean).join(', ')}
      className={cn(cls, 'hover:bg-muted/50 active:bg-muted dark:hover:bg-zinc-800/60')}
    >
      {body}
    </Pressable>
  );
}

/** Rows in one card with hairline dividers. */
export function ListGroup({ children, title, testID }: { children: ReactNode; title?: string; testID?: string }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View testID={testID} className="gap-2">
      {title ? <Text className="px-1 text-sm font-medium text-muted-foreground dark:text-zinc-400">{title}</Text> : null}
      <View className="overflow-hidden rounded-xl border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 ? <View className="border-t border-border dark:border-zinc-800" /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}
