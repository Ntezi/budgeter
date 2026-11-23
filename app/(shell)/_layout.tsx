import React, { useCallback, useMemo } from 'react';
import { Image, Pressable, View, useWindowDimensions } from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSheet } from '@/components/patterns/AppSheet';
import { BottomBar } from '@/components/shell/BottomBar';
import { MonthChip } from '@/components/shell/MonthChip';
import { MoreSheet } from '@/components/shell/MoreSheet';
import { NavIcon } from '@/components/shell/NavIcon';
import { SideRail } from '@/components/shell/SideRail';
import { Sidebar } from '@/components/shell/Sidebar';
import { activeAreaId, activeItem, layoutFor, showsMonthChip, visibleItems } from '@/lib/shell/nav';
import { useThemeMode } from '@/providers/ThemeProvider';

/**
 * BUDG-8 S2 navigation shell (briefs/redesign/00 "Shell"): bottom bar below 768 px, rail
 * 768-1023, sidebar from 1024; More sheet; no drawer, no floating button. Routes unchanged.
 * Each screen still renders its own heading, so the shell shows no page title (title once).
 */
export default function ShellLayout() {
  const { width } = useWindowDimensions();
  const mode = layoutFor(width);
  const pathname = usePathname();
  const router = useRouter();
  const more = useSheet();
  const { theme } = useThemeMode();

  const items = useMemo(() => visibleItems('household'), []);
  const primary = useMemo(() => items.filter((it) => it.group === 'primary'), [items]);
  const moreItems = useMemo(() => items.filter((it) => it.group === 'more'), [items]);
  const areaId = activeAreaId(pathname, items);
  const itemId = activeItem(pathname, items)?.id;
  const chip = showsMonthChip(pathname);

  const go = useCallback((href: string) => router.push(href as any), [router]);
  const onAdd = useCallback(() => router.push('/transactions?action=new-expense' as any), [router]);
  const logo =
    theme === 'dark'
      ? require('../../assets/images/logo/budgeter_logo_white_280x72.png')
      : require('../../assets/images/logo/budgeter_logo_black_280x72.png');

  return (
    <View className="flex-1 bg-background dark:bg-zinc-950">
      <SafeAreaView edges={['top', 'left', 'right']} className="flex-1">
        <View className="flex-1 flex-row">
          {mode === 'desktop' ? <Sidebar primary={primary} more={moreItems} activeAreaId={areaId} activeItemId={itemId} onGo={go} onAdd={onAdd} /> : null}
          {mode === 'tablet' ? <SideRail items={primary} activeId={areaId} onGo={go} onAdd={onAdd} onMore={more.show} /> : null}

          <View className="min-w-0 flex-1">
            {mode === 'phone' ? (
              <View testID="top-bar" className="h-14 flex-row items-center gap-2 border-b border-border bg-card pl-4 pr-1 dark:border-zinc-800 dark:bg-zinc-900">
                <Image source={logo} className="h-6 w-[96px]" resizeMode="contain" accessibilityLabel="Budgeta" />
                <View className="min-w-0 flex-1" />
                {chip ? <MonthChip /> : null}
                <Pressable testID="more-button" accessibilityRole="button" accessibilityLabel="More" onPress={more.show} className="h-11 w-11 items-center justify-center rounded-md">
                  <NavIcon name="dots-horizontal" />
                </Pressable>
              </View>
            ) : chip ? (
              <View testID="top-bar" className="flex-row justify-end px-6 pt-4 lg:px-8">
                <MonthChip />
              </View>
            ) : null}

            <View role="main" className="min-h-0 flex-1 px-4 pb-4 pt-3 md:px-6 md:pt-4 lg:px-8 lg:pt-6">
              <View className="mx-auto w-full max-w-[1200px] flex-1">
                <Slot />
              </View>
            </View>

            {mode === 'phone' ? <BottomBar items={primary} activeId={areaId} onGo={go} onAdd={onAdd} /> : null}
          </View>
        </View>
        <MoreSheet open={more.open} items={moreItems} onClose={() => more.hide()} onGo={(href) => more.hide(() => go(href))} />
      </SafeAreaView>
    </View>
  );
}
