import React from 'react';
import { Text, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';

type Props = { suggested: number; repair: number; error?: string; readOnly: boolean; onReview: (e?: unknown) => void };

/** Reconcile tab becomes a banner (BUDG-8 03); one sentence and one Review (design review D-10). */
export function ReconcileBanner({ suggested, repair, error, readOnly, onReview }: Props) {
  if (!suggested && !repair && !error) return null;
  return (
    <View testID="default-accounts-banner" className="gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-zinc-800 dark:bg-amber-950/30">
      {suggested || repair ? (
        <View className="flex-row flex-wrap items-center gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-base text-foreground dark:text-zinc-50">
              {`${suggested + repair} ${suggested + repair === 1 ? 'line needs' : 'lines need'} an account`}
            </Text>
            <Text className="text-sm text-muted-foreground dark:text-zinc-400">
              {[suggested ? `${suggested} with a suggestion ready` : '', repair ? `${repair} to choose on the line itself` : ''].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {!readOnly && suggested ? <AppButton label="Review" variant="outline" size="touch" onPress={onReview} /> : null}
        </View>
      ) : null}
      {error ? <Text className="text-sm text-destructive dark:text-red-300">{error}</Text> : null}
    </View>
  );
}
