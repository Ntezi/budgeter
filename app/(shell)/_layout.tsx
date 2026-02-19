import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';
import { useThemeMode } from '@/providers/ThemeProvider';

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

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme } = useThemeMode();
  const logoSource =
    theme === 'dark'
      ? require('../../assets/images/budgeter_logo_transparent_280x72.png')
      : require('../../assets/images/budgeter_logo_black_280x72.png');

  return (
    <View className="flex-1 gap-5 px-3 pb-4 pt-5">
      <View className="mx-2 h-12 justify-center rounded-xl border border-border bg-card px-3 dark:border-zinc-800 dark:bg-zinc-900">
        <Image source={logoSource} className="h-7 w-[132px]" resizeMode="contain" />
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-1 pb-4">
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
              <MaterialCommunityIcons name={item.icon} size={20} color={active ? '#030213' : '#717182'} />
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
                <Text className="text-base font-semibold text-foreground dark:text-zinc-50">{pageTitle}</Text>
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
      </SafeAreaView>
    </View>
  );
}
