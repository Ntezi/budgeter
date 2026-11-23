import React from 'react';
import { Text, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';

type Props = { suggested: number; repair: number; error?: string; readOnly: boolean; onReview: (e?: unknown) => void };

/** Reconcile tab becomes a banner (BUDG-8 03); BUDG-3 wording kept. */
export function ReconcileBanner({ suggested, repair, error, readOnly, onReview }: Props) {
  if (!suggested && !repair && !error) return null;
  return (
    <View testID="default-accounts-banner" className="gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-zinc-800 dark:bg-amber-950/30">
      {suggested ? (
        <View className="flex-row flex-wrap items-center gap-3">
          <Text className="min-w-0 flex-1 text-base text-foreground dark:text-zinc-50">
            {`${suggested} ${suggested === 1 ? 'line has' : 'lines have'} a suggested account`}
          </Text>
          {!readOnly ? <AppButton label="Review" variant="outline" size="touch" onPress={onReview} /> : null}
        </View>
      ) : null}
      {repair ? (
        <Text className="text-sm text-amber-700 dark:text-amber-300">
          {`${repair} ${repair === 1 ? 'line needs' : 'lines need'} an account choice: its saved account can't be used.`}
        </Text>
      ) : null}
      {error ? <Text className="text-sm text-destructive dark:text-red-300">{error}</Text> : null}
    </View>
  );
}
