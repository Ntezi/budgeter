import React from 'react';
import { Pressable, type PressableProps } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

type IconActionVariant = 'default' | 'danger' | 'muted';

type Props = Omit<PressableProps, 'children'> & {
  icon: IconName;
  label: string;
  variant?: IconActionVariant;
  className?: string;
  iconSize?: number;
};

const VARIANT_CLASS: Record<IconActionVariant, string> = {
  default: 'border-border bg-card dark:border-slate-700 dark:bg-slate-900',
  danger: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40',
  muted: 'border-border bg-muted dark:border-slate-700 dark:bg-slate-800',
};

const VARIANT_COLOR: Record<IconActionVariant, string> = {
  default: '#475569',
  danger: '#DC2626',
  muted: '#64748B',
};

export function IconActionButton({
  icon,
  label,
  variant = 'default',
  className,
  iconSize = 18,
  disabled,
  ...props
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn(
        'h-9 w-9 items-center justify-center rounded-md border active:opacity-80',
        VARIANT_CLASS[variant],
        disabled && 'opacity-50',
        className
      )}
      disabled={disabled}
      {...props}
    >
      <MaterialCommunityIcons name={icon} size={iconSize} color={VARIANT_COLOR[variant]} />
    </Pressable>
  );
}
