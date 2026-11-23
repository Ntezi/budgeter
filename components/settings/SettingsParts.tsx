import React, { type ReactNode } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppSheet } from '@/components/patterns/AppSheet';
import { AppButton } from '@/components/ui/AppButton';
import { cn } from '@/lib/cn';

export type SettingsPageId = 'workspace' | 'people' | 'reminder' | 'months' | 'import';

/** A labelled card of rows with hairline dividers (09 index: "Household", "App"). */
export function SettingsSection({ title, children, testID }: { title?: string; children: ReactNode; testID?: string }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View testID={testID} className="gap-2">
      {title ? <Text className="px-1 text-sm font-medium text-muted-foreground dark:text-zinc-400">{title}</Text> : null}
      <View className="overflow-hidden rounded-xl border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
        {rows.map((row, i) => (
          <View key={i} className={i ? 'border-t border-border dark:border-zinc-800' : undefined}>
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Label left, value under it on phone (never clipped), chevron right; the whole row is the target. */
export function SettingsRow({ label, value, onPress, selected, testID, right }: { label: string; value?: string; onPress?: () => void; selected?: boolean; testID?: string; right?: ReactNode }) {
  const body = (
    <>
      <View className="min-w-0 flex-1">
        <Text className="text-base font-medium text-foreground dark:text-zinc-50">{label}</Text>
        {value ? <Text className="text-sm text-muted-foreground dark:text-zinc-400">{value}</Text> : null}
      </View>
      {right}
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={20} color="#717182" /> : null}
    </>
  );
  const cls = cn('min-h-14 flex-row items-center gap-3 px-4 py-2', selected ? 'bg-muted dark:bg-zinc-800' : undefined);
  if (!onPress) return <View testID={testID} className={cls}>{body}</View>;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityState={{ selected: Boolean(selected) }}
      className={cn(cls, 'hover:bg-muted/50 active:bg-muted dark:hover:bg-zinc-800/60')}
    >
      {body}
    </Pressable>
  );
}

/** Radio row (min 56 px): workspace, import kind, starting setup. */
export function RadioRow({ label, sub, checked, onPress, testID }: { label: string; sub?: string; checked: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      aria-checked={checked}
      onPress={onPress}
      className="min-h-14 flex-row items-center gap-3 px-4 py-2 hover:bg-muted/50 dark:hover:bg-zinc-800/60"
    >
      <View className={cn('h-5 w-5 items-center justify-center rounded-full border-2', checked ? 'border-primary dark:border-zinc-100' : 'border-border dark:border-zinc-700')}>
        {checked ? <View className="h-2.5 w-2.5 rounded-full bg-primary dark:bg-zinc-50" /> : null}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-base text-foreground dark:text-zinc-50">{label}</Text>
        {sub ? <Text className="text-sm text-muted-foreground dark:text-zinc-400">{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Sub-page frame: on phone and tablet a "Settings" back link, on desktop only the heading (the index is beside it). */
export function SettingsPage({ title, intro, onBack, children, testID }: { title: string; intro?: string; onBack: () => void; children: ReactNode; testID: string }) {
  const { width } = useWindowDimensions();
  return (
    <View testID={testID} className="gap-5">
      {width < 1024 ? (
        <Pressable accessibilityRole="link" accessibilityLabel="Back to Settings" onPress={onBack} className="min-h-11 flex-row items-center gap-1 self-start rounded-md pr-2 hover:bg-muted/50 dark:hover:bg-zinc-800/60">
          <MaterialCommunityIcons name="chevron-left" size={20} color="#717182" />
          <Text className="text-sm font-medium text-muted-foreground dark:text-zinc-400">Settings</Text>
        </Pressable>
      ) : null}
      <View className="gap-1">
        <Text role="heading" aria-level={2} className="text-xl font-semibold text-foreground dark:text-zinc-50">{title}</Text>
        {intro ? <Text className="text-sm text-muted-foreground dark:text-zinc-400">{intro}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** Inline result line: success (role=status) or error (role=alert). */
export function Notice({ kind, text }: { kind: 'ok' | 'error' | 'info'; text: string }) {
  if (!text) return null;
  return (
    <Text
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn('text-sm', kind === 'error' ? 'text-destructive dark:text-red-300' : kind === 'ok' ? 'text-emerald-600 dark:text-emerald-300' : 'text-muted-foreground dark:text-zinc-400')}
    >
      {text}
    </Text>
  );
}

/** Confirm sheet: one sentence, Cancel and the action. Nothing happens until the action is pressed. */
export function ConfirmSheet({ open, onClose, title, message, actionLabel, busy, destructive, onConfirm, testID }: {
  open: boolean; onClose: () => void; title: string; message: string; actionLabel: string; busy?: boolean; destructive?: boolean; onConfirm: () => void; testID?: string;
}) {
  return (
    <AppSheet
      open={open}
      onClose={onClose}
      title={title}
      testID={testID}
      footer={
        <View className="flex-row flex-wrap gap-2">
          <AppButton label="Cancel" variant="outline" size="touch-lg" className="min-w-28 flex-1" onPress={onClose} />
          <AppButton label={busy ? 'Working…' : actionLabel} variant={destructive ? 'destructive' : 'primary'} size="touch-lg" className={destructive ? 'min-w-28 flex-1' : 'min-w-28 flex-1 dark:bg-zinc-50'} textClassName={destructive ? undefined : 'dark:text-zinc-900'} disabled={busy} onPress={onConfirm} />
        </View>
      }
    >
      <Text className="text-base text-foreground dark:text-zinc-50">{message}</Text>
    </AppSheet>
  );
}
