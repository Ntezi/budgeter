import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '@/lib/cn';
import { type NavItem } from '@/lib/shell/nav';
import { NavIcon, OnPrimaryIcon } from '@/components/shell/NavIcon';

type Props = { items: NavItem[]; activeId?: string; onGo: (href: string) => void; onAdd: () => void };

function Tab({ item, active, onGo }: { item: NavItem; active: boolean; onGo: (href: string) => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={item.label}
      {...({ 'aria-current': active ? 'page' : undefined, href: item.href } as any)}
      onPress={(e: any) => {
        e?.preventDefault?.();
        onGo(item.href);
      }}
      className="h-16 min-w-0 flex-1 items-center justify-center gap-1"
    >
      <NavIcon name={item.icon} active={active} />
      <Text numberOfLines={1} className={cn('text-xxs font-medium', active ? 'text-foreground dark:text-zinc-50' : 'text-muted-foreground')}>
        {item.label}
      </Text>
    </Pressable>
  );
}

/** Phone (< 768): Home · Plan · + · Shopping · Accounts (BUDG-8 00 "Shell"). */
export function BottomBar({ items, activeId, onGo, onAdd }: Props) {
  const insets = useSafeAreaInsets();
  const half = Math.ceil(items.length / 2);
  return (
    <View
      role="navigation"
      aria-label="Main"
      testID="bottom-bar"
      style={{ paddingBottom: insets.bottom }}
      className="flex-row items-center border-t border-border bg-card px-1 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {items.slice(0, half).map((it) => (
        <Tab key={it.id} item={it} active={it.id === activeId} onGo={onGo} />
      ))}
      <View className="h-16 min-w-0 flex-1 items-center justify-center">
        <Pressable
          testID="add-button"
          accessibilityRole="button"
          accessibilityLabel="Add expense"
          onPress={onAdd}
          className="h-14 w-14 items-center justify-center rounded-full bg-primary shadow-card dark:bg-zinc-50"
        >
          <OnPrimaryIcon name="plus" />
        </Pressable>
      </View>
      {items.slice(half).map((it) => (
        <Tab key={it.id} item={it} active={it.id === activeId} onGo={onGo} />
      ))}
    </View>
  );
}
