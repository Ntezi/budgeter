import React from 'react';
import { View } from 'react-native';
import { cn } from '@/lib/cn';

type Props = {
  value: number;
  className?: string;
  indicatorClassName?: string;
};

export function AppProgressBar({ value, className, indicatorClassName }: Props) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <View className={cn('h-2 overflow-hidden rounded-full bg-muted dark:bg-zinc-800', className)}>
      <View className={cn('h-full rounded-full bg-primary dark:bg-zinc-50', indicatorClassName)} style={{ width: `${width}%` }} />
    </View>
  );
}
