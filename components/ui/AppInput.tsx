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
        'h-9 rounded-md border border-border bg-input px-3 py-1 text-sm text-foreground dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-50',
        className
      )}
      placeholderTextColor="#717182"
      {...props}
    />
  );
});
