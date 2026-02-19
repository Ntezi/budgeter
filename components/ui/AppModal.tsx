import React, { type ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { cn } from '@/lib/cn';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  contentClassName?: string;
};

export function AppModal({ open, onClose, title, children, contentClassName }: Props) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/50 px-4">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className={cn('z-10 w-full max-w-xl rounded-xl border border-border bg-card p-4 dark:border-zinc-800 dark:bg-zinc-900', contentClassName)}>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-base font-semibold text-foreground dark:text-zinc-50">{title || ''}</Text>
            <Pressable onPress={onClose} className="h-8 w-8 items-center justify-center rounded-md bg-muted dark:bg-zinc-800">
              <Text className="text-lg leading-none text-muted-foreground">×</Text>
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}
