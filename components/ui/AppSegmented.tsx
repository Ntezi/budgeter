import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { cn } from '@/lib/cn';
import { useDense } from '@/lib/shell/density';

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
  /** BUDG-8: 44 px segments below 1024 px; BUDG-41: the old h-8 from 1024 px. */
  touch?: boolean;
  /** BUDG-8 D-4: equal segments filling the width (the page switcher under the title). */
  full?: boolean;
};

export function AppSegmented<T extends string>({ value, options, onChange, className, compact, touch: touchProp, full }: Props<T>) {
  const touch = touchProp && !useDense();
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
                // Q-4: equal thirds; a label that cannot fit wraps to a second line inside the 44 px target
                // ('Shopping item' at 320) instead of being cut or pushing its neighbours off the screen.
                full && 'min-w-0 flex-1 basis-0',
                touch ? (full ? 'min-h-11 px-1 py-0.5' : 'h-11 px-4') : compact ? 'h-7 px-2.5' : full ? 'min-h-8 px-1 py-0.5' : 'h-8 px-3',
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
                  full && 'text-center leading-5',
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
