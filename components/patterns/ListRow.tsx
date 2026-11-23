import React, { Children, Fragment, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';

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
  titleTestID?: string;
};

/** Name left, amount right, one muted line under it; whole row is the target (min 56 px). */
export function ListRow({ title, sub, amount, amountClassName, left, onPress, accessibilityLabel, testID, titleLines = 1, titleTestID }: Props) {
  const body = (
    <>
      {left}
      <View className="min-w-0 flex-1">
        <Text testID={titleTestID} className="text-base font-medium text-foreground dark:text-zinc-50" numberOfLines={titleLines > 0 ? titleLines : undefined}>
          {title}
        </Text>
        {sub ? (
          <Text className="text-sm text-muted-foreground dark:text-zinc-400" numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {amount ? (
        <Text className={cn('shrink-0 text-base font-semibold text-foreground dark:text-zinc-50', amountClassName)} style={{ fontVariant: ['tabular-nums'] }}>
          {amount}
        </Text>
      ) : null}
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={20} color="#717182" /> : null}
    </>
  );
  const cls = 'min-h-14 flex-row items-center gap-3 px-4 py-2';
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
