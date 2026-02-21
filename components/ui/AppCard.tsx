import React, { type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { cn } from '@/lib/cn';

type Props = ViewProps & {
  children: ReactNode;
  className?: string;
};

export function AppCard({ children, className, ...props }: Props) {
  return (
    <View
      className={cn(
        'rounded-xl border border-border bg-card p-3 md:p-4 dark:border-zinc-800 dark:bg-zinc-900',
        className
      )}
      {...props}
    >
      {children}
    </View>
  );
}
