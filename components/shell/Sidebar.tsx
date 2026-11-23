import React from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';
import { type NavItem } from '@/lib/shell/nav';
import { NavIcon } from '@/components/shell/NavIcon';
import { WorkspaceSwitcher } from '@/components/shell/WorkspaceSwitcher';
import { useThemeMode } from '@/providers/ThemeProvider';

type Props = { primary: NavItem[]; more: NavItem[]; activeItemId?: string; activeAreaId?: string; onGo: (href: string) => void; onAdd: () => void };

function Item({ item, active, onGo }: { item: NavItem; active: boolean; onGo: (href: string) => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={item.label}
      {...({ 'aria-current': active ? 'page' : undefined, href: item.href } as any)}
      onPress={(e: any) => {
        e?.preventDefault?.();
        onGo(item.href);
      }}
      className={cn('h-11 flex-row items-center gap-3 rounded-lg px-3', active ? 'bg-primary/10 dark:bg-zinc-800' : 'hover:bg-muted/50 dark:hover:bg-zinc-800/60')}
    >
      <NavIcon name={item.icon} active={active} size={20} />
      <Text className={cn('text-sm font-medium', active ? 'text-primary dark:text-zinc-50' : 'text-muted-foreground')}>{item.label}</Text>
    </Pressable>
  );
}

/** Desktop (>= 1024): w-64 sidebar: logo, Add expense, four areas, divider, more entries, workspace. */
export function Sidebar({ primary, more, activeItemId, activeAreaId, onGo, onAdd }: Props) {
  const { theme } = useThemeMode();
  const logo =
    theme === 'dark'
      ? require('../../assets/images/logo/budgeter_logo_white_280x72.png')
      : require('../../assets/images/logo/budgeter_logo_black_280x72.png');
  return (
    <View role="navigation" aria-label="Main" testID="sidebar" className="w-64 border-r border-border bg-sidebar dark:border-zinc-800 dark:bg-zinc-900">
      <View className="gap-4 px-4 pb-3 pt-5">
        <Image source={logo} style={{ width: 180, height: 32 }} resizeMode="contain" accessibilityLabel="Budgeta" />
        <Pressable
          testID="add-button"
          accessibilityRole="button"
          accessibilityLabel="Add expense"
          onPress={onAdd}
          className="h-11 flex-row items-center justify-center gap-2 rounded-lg bg-primary dark:bg-zinc-50"
        >
          <MaterialCommunityIcons name="plus" size={20} color={theme === 'dark' ? '#09090B' : '#FFFFFF'} />
          <Text className="text-sm font-medium text-white dark:text-zinc-900">Add expense</Text>
        </Pressable>
      </View>
      <ScrollView className="flex-1 px-3" contentContainerClassName="gap-1 pb-4">
        {primary.map((it) => (
          <Item key={it.id} item={it} active={it.id === activeAreaId && (activeItemId === it.id || !more.some((m) => m.id === activeItemId))} onGo={onGo} />
        ))}
        <View className="my-2 border-t border-border dark:border-zinc-800" />
        {more.map((it) => (
          <Item key={it.id} item={it} active={it.id === activeItemId} onGo={onGo} />
        ))}
      </ScrollView>
      <View className="px-4 pb-4">
        <WorkspaceSwitcher onManage={() => onGo('/settings?page=workspace')} />
      </View>
    </View>
  );
}
