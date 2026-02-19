import React from 'react';
import { Text, View } from 'react-native';
import { cn } from '@/lib/cn';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline';

type Props = {
  label: string;
  variant?: BadgeVariant;
  className?: string;
};

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  default: 'border border-transparent bg-primary',
  secondary: 'border border-transparent bg-secondary dark:bg-zinc-800',
  success: 'border border-emerald-200 bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50',
  warning: 'border border-amber-200 bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50',
  danger: 'border border-red-200 bg-red-100 dark:border-red-900 dark:bg-red-950/50',
  outline: 'border border-border bg-transparent',
};

const VARIANT_TEXT_CLASS: Record<BadgeVariant, string> = {
  default: 'text-primary-foreground',
  secondary: 'text-secondary-foreground dark:text-zinc-50',
  success: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  danger: 'text-red-700 dark:text-red-300',
  outline: 'text-foreground dark:text-zinc-50',
};

export function AppBadge({ label, variant = 'default', className }: Props) {
  return (
    <View className={cn('rounded-md px-2 py-0.5', VARIANT_CLASS[variant], className)}>
      <Text className={cn('text-xs font-medium', VARIANT_TEXT_CLASS[variant])}>{label}</Text>
    </View>
  );
}
