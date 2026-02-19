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
    <View className={cn('rounded-lg border border-border bg-muted p-1 dark:border-slate-700 dark:bg-slate-800', className)}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              className={cn(
                'rounded-md px-3 py-2',
                compact && 'px-2.5 py-1.5',
                active ? 'bg-card dark:bg-slate-900' : 'bg-transparent'
              )}
              onPress={() => onChange(option.value)}
            >
              <Text
                className={cn(
                  compact ? 'text-xs' : 'text-sm',
                  'font-medium',
                  active ? 'text-foreground dark:text-slate-100' : 'text-muted-foreground'
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
