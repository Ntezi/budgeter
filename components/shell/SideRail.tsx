import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { cn } from '@/lib/cn';
import { type NavItem } from '@/lib/shell/nav';
import { NavIcon, OnPrimaryIcon } from '@/components/shell/NavIcon';

type Props = { items: NavItem[]; activeId?: string; onGo: (href: string) => void; onAdd: () => void; onMore: () => void };

/** Tablet (768-1023): 72 px rail, Add on top, the four areas, More at the bottom. */
export function SideRail({ items, activeId, onGo, onAdd, onMore }: Props) {
  return (
    <View role="navigation" aria-label="Main" testID="side-rail" className="w-18 items-center gap-1 border-r border-border bg-sidebar py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <Pressable
        testID="add-button"
        accessibilityRole="button"
        accessibilityLabel="Add expense"
        onPress={onAdd}
        className="mb-2 h-14 w-14 items-center justify-center rounded-full bg-primary shadow-card dark:bg-zinc-50"
      >
        <OnPrimaryIcon name="plus" />
      </Pressable>
      {items.map((it) => {
        const active = it.id === activeId;
        return (
          <Pressable
            key={it.id}
            accessibilityRole="link"
            accessibilityLabel={it.label}
            {...({ 'aria-current': active ? 'page' : undefined, href: it.href } as any)}
            onPress={(e: any) => {
              e?.preventDefault?.();
              onGo(it.href);
            }}
            className={cn('h-16 w-16 items-center justify-center gap-1 rounded-lg', active ? 'bg-primary/10 dark:bg-zinc-800' : 'hover:bg-muted/50 dark:hover:bg-zinc-800/60')}
          >
            <NavIcon name={it.icon} active={active} />
            <Text numberOfLines={1} className={cn('text-xxs font-medium', active ? 'text-foreground dark:text-zinc-50' : 'text-muted-foreground')}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
      <View className="flex-1" />
      <Pressable accessibilityRole="button" accessibilityLabel="More" onPress={onMore} className="h-16 w-16 items-center justify-center gap-1 rounded-lg">
        <NavIcon name="dots-horizontal" />
        <Text className="text-xxs font-medium text-muted-foreground">More</Text>
      </Pressable>
    </View>
  );
}
