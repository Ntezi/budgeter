import React, { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

type Action = { label: string; onPress: () => void; accessibilityLabel?: string };

/** Section title (text-lg semibold, the old dashboard section title) with up to two quiet text actions on the right (spec 02). */
export function HomeSection({ title, actions = [], children, testID }: { title: string; actions?: Action[]; children: ReactNode; testID?: string }) {
  return (
    <View testID={testID} className="gap-2">
      <View className="min-h-11 lg:min-h-9 flex-row items-center gap-2">
        <Text role="heading" aria-level={2} className="min-w-0 flex-1 text-lg font-semibold text-foreground dark:text-zinc-50" numberOfLines={1}>
          {title}
        </Text>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            accessibilityLabel={a.accessibilityLabel ?? a.label}
            onPress={a.onPress}
            className="h-11 lg:h-9 justify-center rounded-md px-2 hover:bg-muted dark:hover:bg-zinc-800"
          >
            <Text className="text-sm font-medium text-foreground underline dark:text-zinc-50">{a.label}</Text>
          </Pressable>
        ))}
      </View>
      {children}
    </View>
  );
}
