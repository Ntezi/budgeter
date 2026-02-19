import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { cn } from '@/lib/cn';

type Option = {
  label: string;
  value: string;
};

type Props = {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function DropdownField({ value, options, onChange, placeholder, disabled, className }: Props) {
  const [open, setOpen] = useState(false);

  const label = useMemo(() => options.find((it) => it.value === value)?.label, [options, value]);

  return (
    <View className={cn('relative', className)}>
      <Pressable
        className={cn(
          'h-11 flex-row items-center justify-between rounded-lg border border-border bg-input px-3 dark:border-slate-700 dark:bg-slate-950',
          disabled && 'opacity-50'
        )}
        onPress={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
      >
        <Text className={cn('text-sm', label ? 'text-foreground dark:text-slate-100' : 'text-muted-foreground')} numberOfLines={1}>
          {label ?? placeholder ?? 'Select'}
        </Text>
        <Text className="text-xs text-muted-foreground">{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open ? (
        <View className="absolute z-20 mt-12 max-h-56 w-full overflow-hidden rounded-lg border border-border bg-card dark:border-slate-700 dark:bg-slate-900">
          <ScrollView nestedScrollEnabled>
            {options.map((option) => {
              const active = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  className={cn('px-3 py-2.5', active ? 'bg-primary/10 dark:bg-slate-800' : 'bg-transparent')}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Text className={cn('text-sm', active ? 'text-primary dark:text-slate-100' : 'text-foreground dark:text-slate-100')}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
