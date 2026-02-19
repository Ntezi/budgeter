import React, { forwardRef } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '@/lib/cn';

export const AppInput = forwardRef<TextInput, TextInputProps & { className?: string }>(function AppInput(
  { className, ...props },
  ref
) {
  return (
    <TextInput
      ref={ref}
      className={cn(
        'h-11 rounded-lg border border-border bg-input px-3 text-sm text-foreground dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100',
        className
      )}
      placeholderTextColor="#94A3B8"
      {...props}
    />
  );
});
