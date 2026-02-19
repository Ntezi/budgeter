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
};

export function AppSegmented<T extends string>({ value, options, onChange, className, compact }: Props<T>) {
  return (
    <View className={cn('rounded-md border border-border bg-muted p-0.5 dark:border-zinc-800 dark:bg-zinc-800/70', className)}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              className={cn(
                'h-8 items-center justify-center rounded-md px-3',
                compact && 'h-7 px-2.5',
                active ? 'border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900' : 'bg-transparent'
              )}
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
      </ScrollView>
    </View>
  );
}
