import React, { type ReactNode } from 'react';
import { Pressable, Text, type PressableProps } from 'react-native';
import { cn } from '@/lib/cn';
import { useDense } from '@/lib/shell/density';

export type AppButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
export type AppButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'touch' | 'touch-lg';

type Props = Omit<PressableProps, 'children'> & {
  children?: ReactNode;
  label?: string;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  className?: string;
  textClassName?: string;
};

const VARIANT_CLASS: Record<AppButtonVariant, string> = {
  // BUDG-8: kept tokens only; the near-black primary fill vanished on the dark background.
  primary: 'bg-primary dark:bg-zinc-50',
  secondary: 'bg-secondary dark:bg-zinc-800',
  outline: 'border border-border bg-background dark:border-zinc-800 dark:bg-zinc-900/60',
  ghost: 'bg-transparent',
  destructive: 'bg-destructive',
};

const VARIANT_TEXT_CLASS: Record<AppButtonVariant, string> = {
  primary: 'text-white dark:text-zinc-900',
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
  // BUDG-8: 44 px touch target below 1024 px; BUDG-41: 36 px (md) from 1024 px, like the old app.
  touch: 'h-11 rounded-md px-4',
  // BUDG-8: the one primary action at the bottom of a form or sheet (h-12); BUDG-41: md from 1024 px.
  'touch-lg': 'h-12 rounded-lg px-4',
};

/** BUDG-41: the touch sizes are responsive in this one place (lib/shell/density). */
function sizeClass(size: AppButtonSize, dense: boolean) {
  if (dense && (size === 'touch' || size === 'touch-lg')) return SIZE_CLASS.md;
  return SIZE_CLASS[size];
}

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
  const dense = useDense();
  return (
    <Pressable
      className={cn(
        'items-center justify-center active:opacity-90',
        VARIANT_CLASS[variant],
        sizeClass(size, dense),
        disabled && 'opacity-50',
        className
      )}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
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
