import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { cn } from '@/lib/cn';

type Option<T extends string> = {
  label: string;
  value: T;
};

type Props<T extends string> = {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  className?: string;
  compact?: boolean;
  /** BUDG-8: 44 px segments for phone widths. */
  touch?: boolean;
  /** BUDG-8 D-4: equal segments filling the width (the page switcher under the title). */
  full?: boolean;
};

export function AppSegmented<T extends string>({ value, options, onChange, className, compact, touch, full }: Props<T>) {
  return (
    <View className={cn('rounded-md border border-border bg-muted p-0.5 dark:border-zinc-800 dark:bg-zinc-800/70', className)}>
      <SegmentRow full={full}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              className={cn(
                'items-center justify-center rounded-md',
                full && 'flex-1',
                touch ? 'h-11 px-4' : compact ? 'h-7 px-2.5' : 'h-8 px-3',
                active ? 'border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900' : 'bg-transparent'
              )}
              accessibilityRole="button"
              aria-pressed={active}
              onPress={() => onChange(option.value)}
            >
              <Text
                className={cn(
                  compact ? 'text-xs' : 'text-sm',
                  'font-medium',
                  active ? 'text-foreground dark:text-zinc-50' : 'text-muted-foreground'
                )}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </SegmentRow>
    </View>
  );
}

function SegmentRow({ full, children }: { full?: boolean; children: React.ReactNode }) {
  if (full) return <View className="w-full flex-row gap-1">{children}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1">
      {children}
    </ScrollView>
  );
}
