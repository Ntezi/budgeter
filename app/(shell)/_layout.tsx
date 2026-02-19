import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: 'view-dashboard-outline' as const },
  { label: 'Transactions', href: '/transactions', icon: 'credit-card-outline' as const },
  { label: 'Budgets', href: '/budgets', icon: 'wallet-outline' as const },
  { label: 'Accounts', href: '/accounts', icon: 'bank-outline' as const },
  { label: 'Recurring', href: '/recurring', icon: 'repeat' as const },
  { label: 'Reports', href: '/reports', icon: 'chart-bar' as const },
  { label: 'Settings', href: '/settings', icon: 'cog-outline' as const },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <View className="flex-1 gap-5 px-3 pb-4 pt-5">
      <View className="flex-row items-center gap-3 px-3">
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-primary dark:bg-slate-100">
          <Text className="text-lg font-bold text-primary-foreground dark:text-slate-900">B</Text>
        </View>
        <Text className="text-xl font-bold text-foreground dark:text-slate-100">Budgeter</Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-1 pb-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Pressable
              key={item.href}
              className={cn(
                'h-11 flex-row items-center gap-3 rounded-lg px-3',
                active ? 'bg-primary/10 dark:bg-slate-800' : 'bg-transparent'
              )}
              onPress={() => {
                router.push(item.href);
                if (onNavigate) onNavigate();
              }}
            >
              <MaterialCommunityIcons name={item.icon} size={20} color={active ? '#4338CA' : '#64748B'} />
              <Text className={cn('text-sm font-medium', active ? 'text-primary dark:text-slate-100' : 'text-muted-foreground')}>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const isDesktop = width >= 980;

  const pageTitle = useMemo(() => {
    const exact = NAV_ITEMS.find((it) => pathname === it.href);
    if (exact) return exact.label;
    if (pathname.startsWith('/budgets/')) return 'Budget Detail';
    return 'Budgeter';
  }, [pathname]);

  return (
    <View className="flex-1 bg-background dark:bg-slate-950">
      <SafeAreaView edges={[isDesktop ? 'left' : 'top', 'right']} className="flex-1">
        <View className="flex-1 flex-row">
          {isDesktop ? (
            <View className="w-72 border-r border-border bg-sidebar dark:border-slate-800 dark:bg-slate-900">
              <SidebarNav />
            </View>
          ) : null}

          <View className="flex-1">
            {!isDesktop ? (
              <View className="h-14 flex-row items-center gap-3 border-b border-border bg-card px-4 dark:border-slate-800 dark:bg-slate-900">
                <Pressable className="h-9 w-9 items-center justify-center rounded-md bg-muted dark:bg-slate-800" onPress={() => setMenuOpen(true)}>
                  <MaterialCommunityIcons name="menu" size={20} color="#64748B" />
                </Pressable>
                <Text className="text-base font-semibold text-foreground dark:text-slate-100">{pageTitle}</Text>
              </View>
            ) : null}

            <View className="flex-1 px-4 pb-6 pt-4 md:px-8 md:pt-6">
              <Slot />
            </View>
          </View>
        </View>

        {!isDesktop && menuOpen ? (
          <View className="absolute inset-0 z-50 flex-row">
            <View className="w-72 border-r border-border bg-sidebar dark:border-slate-800 dark:bg-slate-900">
              <SidebarNav onNavigate={() => setMenuOpen(false)} />
            </View>
            <Pressable className="flex-1 bg-black/45" onPress={() => setMenuOpen(false)} />
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}
