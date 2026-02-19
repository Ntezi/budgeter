import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  menuClassName?: string;
  triggerClassName?: string;
  menuStrategy?: 'overlay' | 'inline';
};

export function DropdownField({
  value,
  options,
  onChange,
  placeholder,
  disabled,
  className,
  menuClassName,
  triggerClassName,
  menuStrategy = 'overlay',
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<any>(null);

  const label = useMemo(() => options.find((it) => it.value === value)?.label, [options, value]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;

    const onDocPointerDown = (event: MouseEvent) => {
      const rootEl: HTMLElement | null = rootRef.current as HTMLElement | null;
      const target = event.target as Node | null;
      if (!rootEl || !target) return;
      if (typeof (rootEl as any).contains !== 'function') return;
      if (!rootEl.contains(target)) setOpen(false);
    };

    document.addEventListener('mousedown', onDocPointerDown);
    return () => document.removeEventListener('mousedown', onDocPointerDown);
  }, [open]);

  return (
    <View ref={rootRef} className={cn('relative', className)}>
      <Pressable
        className={cn(
          'h-9 flex-row items-center justify-between rounded-md border border-border bg-input px-3 dark:border-zinc-700 dark:bg-zinc-800/80',
          disabled && 'opacity-50',
          triggerClassName
        )}
        onPress={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
      >
        <Text className={cn('flex-1 pr-2 text-sm', label ? 'text-foreground dark:text-zinc-50' : 'text-muted-foreground')} numberOfLines={1}>
          {label ?? placeholder ?? 'Select'}
        </Text>
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#717182" />
      </Pressable>
      {open ? (
        <View
          className={cn(
            menuStrategy === 'overlay'
              ? 'absolute z-50 mt-10 max-h-56 w-full overflow-hidden rounded-md border border-border bg-card dark:border-zinc-700 dark:bg-zinc-900'
              : 'z-50 mt-2 max-h-56 w-full overflow-hidden rounded-md border border-border bg-card dark:border-zinc-700 dark:bg-zinc-900',
            menuClassName
          )}
        >
          <ScrollView nestedScrollEnabled>
            {options.map((option) => {
              const active = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  className={cn('px-3 py-2.5', active ? 'bg-primary/10 dark:bg-zinc-800' : 'bg-transparent')}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Text
                    className={cn('text-sm', active ? 'text-primary dark:text-zinc-50' : 'text-foreground dark:text-zinc-50')}
                    numberOfLines={1}
                  >
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
