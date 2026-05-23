import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';
import { DropdownField } from '@/components/ui/DropdownField';
import { useThemeMode } from '@/providers/ThemeProvider';
import { useWorkspace } from '@/providers/WorkspaceProvider';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: 'view-dashboard-outline' as const },
  { label: 'Transactions', href: '/transactions', icon: 'credit-card-outline' as const },
  { label: 'Budgets', href: '/budgets', icon: 'wallet-outline' as const },
  { label: 'Accounts', href: '/accounts', icon: 'bank-outline' as const },
  { label: 'Expenses', href: '/expenses', icon: 'format-list-bulleted' as const },
  { label: 'Shopping', href: '/shopping', icon: 'cart-outline' as const },
  { label: 'Recurring', href: '/recurring', icon: 'repeat' as const },
  { label: 'Reports', href: '/reports', icon: 'chart-bar' as const },
  { label: 'Settings', href: '/settings', icon: 'cog-outline' as const },
];

function WorkspaceSwitcher({ compact = false }: { compact?: boolean }) {
  const { activeWorkspaceId, legacyMode, setActiveWorkspaceId, workspaceOptions } = useWorkspace();

  const options = useMemo(
    () =>
      workspaceOptions.map((option) => ({
        label: `${option.label}${option.legacyMode ? ' (existing data)' : ''}`,
        value: option.workspaceId,
      })),
    [workspaceOptions]
  );

  if (!options.length) return null;

  return (
    <View className={cn(compact ? 'min-w-[170px] max-w-[220px] flex-1' : 'gap-1 px-1 pb-4')}>
      {!compact ? (
        <Text className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground dark:text-zinc-400">Workspace</Text>
      ) : null}
      <DropdownField
        value={activeWorkspaceId || ''}
        options={options}
        onChange={(value) => void setActiveWorkspaceId(value)}
        placeholder="Select workspace"
        triggerClassName={cn(
          compact ? 'h-9 bg-background dark:bg-zinc-950' : 'bg-background dark:bg-zinc-950',
          !legacyMode && 'border-amber-300 dark:border-amber-600'
        )}
        menuClassName={compact ? 'min-w-[220px]' : undefined}
      />
      {!compact && !legacyMode ? (
        <Text className="px-1 text-xs text-amber-700 dark:text-amber-300">
          Older records may be under the existing data workspace.
        </Text>
      ) : null}
    </View>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme } = useThemeMode();
  const logoSource =
    theme === 'dark'
      ? require('../../assets/images/logo/budgeter_logo_white_280x72.png')
      : require('../../assets/images/logo/budgeter_logo_black_280x72.png');
  const activeIconColor = theme === 'dark' ? '#F4F4F5' : '#030213';

  return (
    <View className="flex-1 pb-4 pt-5">
      <View className="px-1 pb-4">
        <Image source={logoSource} className="h-8 w-[180px]" resizeMode="contain" />
      </View>

      <WorkspaceSwitcher />

      <ScrollView className="flex-1 px-3" contentContainerClassName="gap-1 pb-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Pressable
              key={item.href}
              className={cn(
                'h-11 flex-row items-center gap-3 rounded-lg px-3',
                active ? 'bg-primary/10 dark:bg-zinc-800' : 'bg-transparent hover:bg-muted/50 dark:hover:bg-zinc-800/60'
              )}
              {...({ title: item.label } as any)}
              onPress={() => {
                router.push(item.href);
                if (onNavigate) onNavigate();
              }}
            >
              <MaterialCommunityIcons name={item.icon} size={20} color={active ? activeIconColor : '#717182'} />
              <Text className={cn('text-sm font-medium', active ? 'text-primary dark:text-zinc-50' : 'text-muted-foreground')}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function ShellLayout() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const pathname = usePathname();

  const isDesktop = width >= 980;

  const pageTitle = useMemo(() => {
    const exact = NAV_ITEMS.find((it) => pathname === it.href);
    if (exact) return exact.label;
    if (pathname.startsWith('/budgets/')) return 'Budget Detail';
    return 'Budgeter';
  }, [pathname]);

  useEffect(() => {
    setQuickOpen(false);
  }, [pathname]);

  const quickActions = [
    { label: 'New Shopping Item', href: '/shopping?action=new-item', icon: 'cart-plus' as const },
    { label: 'Shopping Items', href: '/shopping-items', icon: 'format-list-bulleted-square' as const },
    { label: 'Expenses', href: '/expenses', icon: 'format-list-bulleted' as const },
    { label: 'Accounts', href: '/accounts', icon: 'bank-outline' as const },
  ];

  return (
    <View className="flex-1 bg-background dark:bg-zinc-950">
      <SafeAreaView edges={[isDesktop ? 'left' : 'top', 'right']} className="flex-1">
        <View className="flex-1 flex-row">
          {isDesktop ? (
            <View className="w-72 border-r border-border bg-sidebar dark:border-zinc-800 dark:bg-zinc-900">
              <SidebarNav />
            </View>
          ) : null}

          <View className="flex-1">
            {!isDesktop ? (
              <View className="h-14 flex-row items-center gap-3 border-b border-border bg-card px-4 dark:border-zinc-800 dark:bg-zinc-900">
                <Pressable
                  className="h-9 w-9 items-center justify-center rounded-md bg-muted dark:bg-zinc-800"
                  onPress={() => setMenuOpen(true)}
                  {...({ title: 'Open navigation' } as any)}
                >
                  <MaterialCommunityIcons name="menu" size={20} color="#717182" />
                </Pressable>
                <Text className="flex-1 text-base font-semibold text-foreground dark:text-zinc-50" numberOfLines={1}>
                  {pageTitle}
                </Text>
                <WorkspaceSwitcher compact />
              </View>
            ) : null}

            <View className="flex-1 px-3 pb-6 pt-3 sm:px-4 md:px-8 md:pt-6">
              <View className="mx-auto w-full max-w-[1460px] flex-1">
                <Slot />
              </View>
            </View>
          </View>
        </View>

        {!isDesktop && menuOpen ? (
          <View className="absolute inset-0 z-50 flex-row">
            <View className="w-72 border-r border-border bg-sidebar dark:border-zinc-800 dark:bg-zinc-900">
              <SidebarNav onNavigate={() => setMenuOpen(false)} />
            </View>
            <Pressable className="flex-1 bg-black/45" onPress={() => setMenuOpen(false)} />
          </View>
        ) : null}

        {!menuOpen ? (
          <View className="absolute bottom-6 right-6 z-40 items-end gap-2">
            {quickOpen
              ? quickActions.map((action) => (
                  <View key={action.label} className="flex-row items-center gap-2">
                    <View className="rounded-md border border-border bg-card px-2.5 py-1.5 dark:border-zinc-700 dark:bg-zinc-900">
                      <Text className="text-xs font-medium text-foreground dark:text-zinc-50">{action.label}</Text>
                    </View>
                    <Pressable
                      className="h-10 w-10 items-center justify-center rounded-full border border-border bg-card dark:border-zinc-700 dark:bg-zinc-900"
                      onPress={() => {
                        router.push(action.href);
                        setQuickOpen(false);
                        setMenuOpen(false);
                      }}
                      {...({ title: action.label } as any)}
                    >
                      <MaterialCommunityIcons name={action.icon} size={18} color="#717182" />
                    </Pressable>
                  </View>
                ))
              : null}
            <Pressable
              className="h-12 w-12 items-center justify-center rounded-full bg-primary shadow-card"
              onPress={() => setQuickOpen((prev) => !prev)}
              {...({ title: quickOpen ? 'Close quick actions' : 'Open quick actions' } as any)}
            >
              <MaterialCommunityIcons name={quickOpen ? 'close' : 'plus'} size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}
