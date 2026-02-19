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
  default: 'bg-primary/10',
  secondary: 'bg-secondary',
  success: 'bg-emerald-100 dark:bg-emerald-950/50',
  warning: 'bg-amber-100 dark:bg-amber-950/50',
  danger: 'bg-red-100 dark:bg-red-950/50',
  outline: 'bg-transparent border border-border',
};

const VARIANT_TEXT_CLASS: Record<BadgeVariant, string> = {
  default: 'text-primary dark:text-slate-100',
  secondary: 'text-secondary-foreground dark:text-slate-100',
  success: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  danger: 'text-red-700 dark:text-red-300',
  outline: 'text-muted-foreground',
};

export function AppBadge({ label, variant = 'default', className }: Props) {
  return (
    <View className={cn('rounded-full px-2.5 py-1', VARIANT_CLASS[variant], className)}>
      <Text className={cn('text-xxs font-semibold uppercase tracking-wide', VARIANT_TEXT_CLASS[variant])}>{label}</Text>
    </View>
  );
}
