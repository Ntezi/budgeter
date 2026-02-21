import React, { type ReactNode } from 'react';
import { Pressable, Text, type PressableProps } from 'react-native';
import { cn } from '@/lib/cn';

export type AppButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
export type AppButtonSize = 'sm' | 'md' | 'lg' | 'icon';

type Props = Omit<PressableProps, 'children'> & {
  children?: ReactNode;
  label?: string;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  className?: string;
  textClassName?: string;
};

const VARIANT_CLASS: Record<AppButtonVariant, string> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary dark:bg-zinc-800',
  outline: 'border border-border bg-background dark:border-zinc-800 dark:bg-zinc-900/60',
  ghost: 'bg-transparent',
  destructive: 'bg-destructive',
};

const VARIANT_TEXT_CLASS: Record<AppButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-secondary-foreground dark:text-zinc-50',
  outline: 'text-foreground dark:text-zinc-50',
  ghost: 'text-foreground dark:text-zinc-50',
  destructive: 'text-white',
};

const SIZE_CLASS: Record<AppButtonSize, string> = {
  sm: 'h-8 rounded-md px-3',
  md: 'h-9 rounded-md px-4',
  lg: 'h-10 rounded-md px-6',
  icon: 'h-9 w-9 rounded-md items-center justify-center px-0',
};

export function AppButton({
  label,
  variant = 'primary',
  size = 'md',
  className,
  textClassName,
  children,
  disabled,
  ...props
}: Props) {
  return (
    <Pressable
      className={cn(
        'items-center justify-center active:opacity-90',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        disabled && 'opacity-50',
        className
      )}
      disabled={disabled}
      {...props}
    >
      {typeof children === 'string' || typeof children === 'number' || label ? (
        <Text className={cn('text-sm font-medium', VARIANT_TEXT_CLASS[variant], textClassName)}>
          {label ?? children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
