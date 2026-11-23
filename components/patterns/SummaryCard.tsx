import React, { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppProgressBar } from '@/components/ui/AppProgressBar';

type Props = {
  label: string;
  amount: string;
  sentence?: string;
  progress?: number;
  details?: ReactNode;
  detailsLabel?: string;
  testID?: string;
};

/** One big number, one sentence, optional progress, breakdown behind a disclosure (BUDG-8 00). */
export function SummaryCard({ label, amount, sentence, progress, details, detailsLabel = 'Details', testID }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <View testID={testID} className="gap-2 rounded-xl border border-border bg-card p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-900">
      <Text className="text-sm text-muted-foreground dark:text-zinc-400">{label}</Text>
      <Text className="text-3xl font-bold text-foreground dark:text-zinc-50" numberOfLines={1} adjustsFontSizeToFit>
        {amount}
      </Text>
      {typeof progress === 'number' ? <AppProgressBar value={progress} /> : null}
      {sentence ? <Text className="text-sm text-foreground dark:text-zinc-50">{sentence}</Text> : null}
      {details ? (
        <>
          <Pressable
            accessibilityRole="button"
            aria-expanded={open}
            onPress={() => setOpen((v) => !v)}
            className="-mx-2 h-11 flex-row items-center gap-1 self-start rounded-md px-2"
          >
            <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{detailsLabel}</Text>
            <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={20} color="#717182" />
          </Pressable>
          {open ? <View className="gap-2">{details}</View> : null}
        </>
      ) : null}
    </View>
  );
}
