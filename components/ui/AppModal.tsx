import React, { type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  contentClassName?: string;
  /** BUDG-8: "sheet" = bottom sheet below 768 px, centred dialog (max-w-xl) from 768 px. */
  presentation?: 'dialog' | 'sheet';
  /** Sheet only: sticky footer holding the one primary action. */
  footer?: ReactNode;
  testID?: string;
};

export function AppModal({ open, onClose, title, children, contentClassName, presentation = 'dialog', footer, testID }: Props) {
  const { width } = useWindowDimensions();
  if (presentation === 'sheet') {
    const phone = width < 768;
    return (
      <Modal visible={open} transparent animationType={phone ? 'slide' : 'fade'} onRequestClose={onClose}>
        <View className={cn('flex-1 bg-black/50', phone ? 'justify-end' : 'items-center justify-center px-6')}>
          <Pressable className="absolute inset-0" onPress={onClose} focusable={false} accessible={false} />
          <View
            role="dialog"
            aria-modal
            aria-label={title}
            testID={testID}
            className={cn(
              'z-10 w-full border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900',
              phone ? 'max-h-[90%] rounded-t-2xl' : 'max-h-[90%] max-w-xl rounded-xl',
              contentClassName
            )}
          >
            {phone ? (
              <View className="items-center pt-2">
                <View className="h-1 w-10 rounded-full bg-muted dark:bg-zinc-800" />
              </View>
            ) : null}
            <View className="flex-row items-center gap-2 pl-4 pr-1 pt-1">
              <Text role="heading" className="min-w-0 flex-1 text-base font-semibold text-foreground dark:text-zinc-50" numberOfLines={1}>
                {title || ''}
              </Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                className="h-11 lg:h-9 w-11 lg:w-9 items-center justify-center rounded-md hover:bg-muted dark:hover:bg-zinc-800"
              >
                <MaterialCommunityIcons name="close" size={22} color="#717182" />
              </Pressable>
            </View>
            <ScrollView className="shrink" contentContainerClassName="gap-4 px-4 pb-4 pt-2" keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            {footer ? <View className="gap-2 border-t border-border px-4 pb-4 pt-3 dark:border-zinc-800">{footer}</View> : null}
          </View>
        </View>
      </Modal>
    );
  }
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/50 px-4">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View role="dialog" aria-modal aria-label={title} testID={testID} className={cn('z-10 w-full max-w-xl rounded-xl border border-border bg-card p-3 md:p-4 dark:border-zinc-800 dark:bg-zinc-900', contentClassName)}>
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
