import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { cn } from '@/lib/cn';

/** Accounts area: Balances | Activity (spec 04/05). Routes stay /accounts and /transactions; ?month= is carried. */
export function AccountsSegment({ active, month }: { active: 'balances' | 'activity'; month?: string }) {
  const router = useRouter();
  const q = month ? `?month=${month}` : '';
  const items = [
    { id: 'balances', label: 'Balances', href: `/accounts${q}` },
    { id: 'activity', label: 'Activity', href: `/transactions${q}` },
  ] as const;
  return (
    <View role="tablist" aria-label="Accounts views" testID="accounts-segment" className="w-full flex-row rounded-lg bg-muted p-1 dark:bg-zinc-800">
      {items.map((it) => {
        const on = it.id === active;
        return (
          <Pressable
            key={it.id}
            role="tab"
            aria-selected={on}
            onPress={() => (on ? undefined : router.replace(it.href as any))}
            className={cn('h-11 lg:h-9 min-w-24 flex-1 items-center justify-center rounded-md px-4', on ? 'bg-card shadow-soft dark:bg-zinc-950' : '')}
          >
            <Text className={cn('text-sm font-medium', on ? 'text-foreground dark:text-zinc-50' : 'text-muted-foreground dark:text-zinc-400')}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
