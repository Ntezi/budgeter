import React, { forwardRef } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '@/lib/cn';
import { useControlHeight } from '@/lib/shell/density';

export const AppInput = forwardRef<TextInput, TextInputProps & { className?: string }>(function AppInput(
  { className, style, ...props },
  ref
) {
  // BUDG-41: 36 px from 1024 px (old h-9), 44 px below; text stays text-sm (the old size) at every width.
  const height = useControlHeight();
  return (
    <TextInput
      ref={ref}
      className={cn(
        'rounded-md border border-border bg-input px-3 py-1 text-sm text-foreground dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-50',
        className
      )}
      placeholderTextColor="#717182"
      style={[props.multiline ? { minHeight: height } : { height }, style]}
      {...props}
    />
  );
});
