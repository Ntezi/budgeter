import React, { type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PageHeader } from '@/components/patterns/PageHeader';
import { AppSegmented } from '@/components/ui/AppSegmented';
import type { RegularKind } from './types';

export const KIND_SENTENCE: Record<RegularKind, string> = {
  // Fact (lib/repo/recurring.ts seedBudgetForNewPeriod): "Add from templates" in Plan reads Repeats only;
  // Categories feed the plan's "Add cost" picker and the year plan's category link.
  categories: 'Things you spend on, ready to add to a month. Each can remember which account pays.',
  repeats: 'Income and costs that come back every month. Used when you start a month from your regular costs.',
};

/** "Regular costs" with Categories | Repeats; the routes stay /expenses and /recurring. */
export function RegularCostsHeader({ kind, right }: { kind: RegularKind; right?: ReactNode }) {
  const router = useRouter();
  return (
    <View className="gap-3">
      <PageHeader
        title="Regular costs"
        right={right}
        switcher={
          <AppSegmented
            touch
            full
            value={kind}
            onChange={(v) => {
              if (v !== kind) router.replace(v === 'repeats' ? '/recurring' : '/expenses');
            }}
            options={[
              { label: 'Categories', value: 'categories' },
              { label: 'Repeats', value: 'repeats' },
            ]}
          />
        }
      />
      <Text className="text-xs text-muted-foreground dark:text-zinc-400">{KIND_SENTENCE[kind]}</Text>
    </View>
  );
}
