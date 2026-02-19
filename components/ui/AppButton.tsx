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
  primary: 'bg-primary dark:bg-slate-100',
  secondary: 'bg-secondary dark:bg-slate-800',
  outline: 'border border-border bg-card dark:bg-slate-900',
  ghost: 'bg-transparent',
  destructive: 'bg-destructive',
};

const VARIANT_TEXT_CLASS: Record<AppButtonVariant, string> = {
  primary: 'text-primary-foreground dark:text-slate-900',
  secondary: 'text-secondary-foreground dark:text-slate-100',
  outline: 'text-foreground dark:text-slate-100',
  ghost: 'text-foreground dark:text-slate-100',
  destructive: 'text-white',
};

const SIZE_CLASS: Record<AppButtonSize, string> = {
  sm: 'h-9 px-3',
  md: 'h-11 px-4',
  lg: 'h-12 px-5',
  icon: 'h-10 w-10 items-center justify-center px-0',
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
        'items-center justify-center rounded-lg active:opacity-90',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        disabled && 'opacity-50',
        className
      )}
      disabled={disabled}
      {...props}
    >
      {typeof children === 'string' || typeof children === 'number' || label ? (
        <Text className={cn('text-sm font-semibold', VARIANT_TEXT_CLASS[variant], textClassName)}>
          {label ?? children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
