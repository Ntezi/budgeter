import React, { type ReactNode } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';

type Props = { title: string; subtitle?: string; right?: ReactNode };

/**
 * Page header (BUDG-8 00). Phone: the shell's top bar carries the title, so only the subtitle and
 * the right slot render here (no repeated h1). From 768 px: title text-2xl bold with the right slot.
 */
export function PageHeader({ title, subtitle, right }: Props) {
  const { width } = useWindowDimensions();
  const phone = width < 768;
  if (phone && !subtitle && !right) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-3">
      <View className="min-w-0 flex-1 gap-1">
        {!phone ? (
          <Text role="heading" aria-level={1} className="text-2xl font-bold text-foreground dark:text-zinc-50">
            {title}
          </Text>
        ) : null}
        {subtitle ? <Text className="text-sm text-muted-foreground dark:text-zinc-400">{subtitle}</Text> : null}
      </View>
      {right ? <View className="flex-row items-center gap-2">{right}</View> : null}
    </View>
  );
}
