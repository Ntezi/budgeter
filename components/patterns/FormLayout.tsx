import React, { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDense } from '@/lib/shell/density';

/** Label above the field (text-xs medium, the old field-label size). */
export function FormField({ label, children, nativeID }: { label: string; children: ReactNode; nativeID?: string }) {
  return (
    <View className="gap-1.5">
      <Text nativeID={nativeID} className="text-xs font-medium text-foreground dark:text-zinc-50">
        {label}
      </Text>
      {children}
    </View>
  );
}

/** A tappable row: label left, current value right, chevron (e.g. "Paid from  Household account  ›"). */
export function FormRow({ label, value, onPress, children }: { label: string; value?: string; onPress?: () => void; children?: ReactNode }) {
  const rowH = useDense() ? 'min-h-9' : 'min-h-11 lg:min-h-9';
  const inner = (
    <>
      <Text className="w-24 shrink-0 text-xs font-medium text-foreground dark:text-zinc-50">{label}</Text>
      <View className="min-w-0 flex-1 items-end">
        {children ?? (
          <Text className="text-sm text-foreground dark:text-zinc-50" numberOfLines={1}>
            {value}
          </Text>
        )}
      </View>
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={20} color="#717182" /> : null}
    </>
  );
  if (!onPress) return <View className={`${rowH} flex-row items-center gap-3`}>{inner}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ?? ''}`} onPress={onPress} className={`${rowH} flex-row items-center gap-3`}>
      {inner}
    </Pressable>
  );
}

/** One column, most important field first; the summary line sits right above the one primary action. */
export function FormLayout({ children, summary, primary, secondary }: { children: ReactNode; summary?: ReactNode; primary?: ReactNode; secondary?: ReactNode }) {
  return (
    <View className="gap-4">
      {children}
      {summary || primary ? (
        <View className="gap-3 border-t border-border pt-3 dark:border-zinc-800">
          {summary}
          {primary}
          {secondary}
        </View>
      ) : null}
    </View>
  );
}
