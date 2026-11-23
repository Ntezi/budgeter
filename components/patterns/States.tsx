import React from 'react';
import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';

type Icon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Empty: icon 32, one sentence, one button (BUDG-8 00 "States"). */
export function EmptyState({ icon = 'inbox-outline', message, actionLabel, onAction, testID }: { icon?: Icon; message: string; actionLabel?: string; onAction?: () => void; testID?: string }) {
  return (
    <View testID={testID} className="items-center gap-3 rounded-xl border border-border bg-card px-4 py-8 dark:border-zinc-800 dark:bg-zinc-900">
      <MaterialCommunityIcons name={icon} size={32} color="#717182" />
      <Text className="text-center text-base text-foreground dark:text-zinc-50">{message}</Text>
      {actionLabel && onAction ? <AppButton label={actionLabel} size="touch" onPress={onAction} /> : null}
    </View>
  );
}

/** Loading: three skeleton rows, no spinner over content. */
export function LoadingState({ rows = 3, testID }: { rows?: number; testID?: string }) {
  return (
    <View testID={testID} accessibilityLabel="Loading" aria-busy className="gap-3 rounded-xl border border-border bg-card p-4 dark:border-zinc-800 dark:bg-zinc-900">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} className="gap-2">
          <View className="h-4 w-2/3 rounded-md bg-muted dark:bg-zinc-800" />
          <View className="h-3 w-1/3 rounded-md bg-muted dark:bg-zinc-800" />
        </View>
      ))}
    </View>
  );
}

/** Error: destructive text and "Try again". */
export function ErrorState({ message, onRetry, testID }: { message: string; onRetry?: () => void; testID?: string }) {
  return (
    <View testID={testID} role="alert" className="gap-3 rounded-xl border border-border bg-card p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <Text className="text-base text-destructive dark:text-red-300">{message}</Text>
      {onRetry ? <AppButton label="Try again" variant="outline" size="touch" className="self-start" onPress={onRetry} /> : null}
    </View>
  );
}

/** Locked month: badge + one line; the screen removes edit controls (not greyed). */
export function LockedState({ monthLabel, testID }: { monthLabel: string; testID?: string }) {
  return (
    <View testID={testID} className="flex-row flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <AppBadge label="Closed" variant="secondary" />
      <Text className="min-w-0 flex-1 text-sm text-foreground dark:text-zinc-50">
        {monthLabel} is closed. You can read it, not change it.
      </Text>
    </View>
  );
}

/** Chef view after the household stops sharing. */
export function AccessEndedState({ testID }: { testID?: string }) {
  return <EmptyState testID={testID} icon="link-variant-off" message="The household stopped sharing this list." />;
}
