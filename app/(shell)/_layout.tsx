import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { Slot, useGlobalSearchParams, useNavigationContainerRef, usePathname, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddSheetProvider, useAddSheet } from '@/components/add/AddSheetContext';
import { useSheet } from '@/components/patterns/AppSheet';
import { BottomBar } from '@/components/shell/BottomBar';
import { MonthChip } from '@/components/shell/MonthChip';
import { MoreSheet } from '@/components/shell/MoreSheet';
import { NavIcon } from '@/components/shell/NavIcon';
import { SideRail } from '@/components/shell/SideRail';
import { Sidebar } from '@/components/shell/Sidebar';
import { activeAreaId, activeItem, audienceFor, layoutFor, pageTitleFor, shellViewFor, showsMonthChip, visibleItems, type Audience } from '@/lib/shell/nav';
import { useAuthUser } from '@/providers/AuthProvider';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { watchPeriods } from '@/lib/repo/periods';
import { watchSharedWithMe } from '@/lib/repo/sharedLists';

/**
 * BUDG-8 S2 navigation shell (briefs/redesign/00 "Shell"): bottom bar below 768 px, rail
 * 768-1023, sidebar from 1024; More sheet; no drawer, no floating button. Routes unchanged.
 * Phone: the top bar shows the page title (h1, design review D-2); from 768 px PageHeader shows it.
 */
export default function ShellLayout() {
  return (
    <AddSheetProvider>
      <Shell />
    </AddSheetProvider>
  );
}

/** Who the shell is for (lib/shell/nav audienceFor); null while loading. */
function useAudience(): Audience | null {
  const myUid = useAuthUser()?.uid || '';
  const { workspaceOptions, ready } = useWorkspace();
  const [shared, setShared] = useState<number | null>(null);
  const [months, setMonths] = useState<number | null>(null);
  useEffect(() => {
    if (!myUid) return;
    return watchSharedWithMe(myUid, (rows) => setShared(rows.length), () => setShared(0));
  }, [myUid]);
  useEffect(() => {
    if (!myUid) return;
    return watchPeriods(myUid, (rows) => setMonths(rows.length));
  }, [myUid]);
  const memberships = ready ? workspaceOptions.filter((w) => w.ownerUid !== myUid).length : null;
  const chefFor = useRef(''); // uid that has seen the chef shell in this session
  const audience = audienceFor({ sharedWithMe: shared, ownMonths: months, memberships }, chefFor.current === myUid && !!myUid);
  if (audience === 'chef') chefFor.current = myUid;
  if (audience === 'household') rememberHousehold(myUid);
  // D-5: only a household seen earlier in this tab skips the wait (so its screens show their own
  // loading states at once); a chef, or anyone new in this tab, waits for the live answer.
  if (audience === null && myUid && wasHousehold(myUid)) return 'household';
  return audience;
}

const HOUSEHOLD_KEY = 'budgeta:shell-household';
function rememberHousehold(uid: string) {
  try {
    if (uid && globalThis.sessionStorage?.getItem(HOUSEHOLD_KEY) !== uid) globalThis.sessionStorage?.setItem(HOUSEHOLD_KEY, uid);
  } catch {}
}
function wasHousehold(uid: string): boolean {
  try {
    return globalThis.sessionStorage?.getItem(HOUSEHOLD_KEY) === uid;
  } catch {
    return false;
  }
}

function Shell() {
  const audience = useAudience();
  // BUDG-8 D-5: nothing household (no frame, no bar, no screen) renders until the audience is known,
  // so a chef never sees an empty household frame; screens show their own loading state afterwards.
  if (audience === null) return <ShellLoading />;
  if (audience === 'chef') return <ChefShell />;
  return <HouseholdShell ready />;
}

/** Neutral while the audience loads: the page background and a busy marker, no navigation, no text. */
function ShellLoading() {
  return <View testID="shell-loading" aria-busy accessibilityLabel="Loading" className="flex-1 bg-background dark:bg-zinc-950" />;
}

/**
 * BUDG-4 chef: the shared list only, never household navigation or screens (lib/shell/nav shellViewFor).
 * Off the shared list nothing is rendered, so the (shell) Slot navigator is unmounted; a router.replace
 * would target that unmounted navigator (expo-router getNavigateAction picks the deepest matching one)
 * and be dropped, which left a reloaded chef on /dashboard. The root navigator is always mounted
 * (app/_layout.tsx), so the shell resets it to the shared list instead; this also leaves no household
 * entry behind it in the stack.
 */
function ChefShell() {
  const pathname = usePathname();
  const nav = useNavigationContainerRef();
  const view = shellViewFor('chef', pathname);
  useEffect(() => {
    if (view !== 'chef-redirect' || !nav.isReady()) return;
    nav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: '(shell)', state: { index: 0, routes: [{ name: 'shopping' }] } }] }));
  }, [nav, pathname, view]);
  return (
    <View className="flex-1 bg-background dark:bg-zinc-950">
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} className="flex-1">
        <View role="main" testID="chef-shell" className="min-h-0 flex-1 px-4 pb-4 pt-3 md:px-6 md:pt-4 lg:px-8 lg:pt-6">
          <View className="mx-auto w-full max-w-[1200px] flex-1">{view === 'chef' ? <Slot /> : null}</View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function HouseholdShell({ ready }: { ready: boolean }) {
  const { width } = useWindowDimensions();
  const mode = layoutFor(width);
  const pathname = usePathname();
  const router = useRouter();
  const more = useSheet();

  const items = useMemo(() => visibleItems('household'), []);
  const primary = useMemo(() => items.filter((it) => it.group === 'primary'), [items]);
  const moreItems = useMemo(() => items.filter((it) => it.group === 'more'), [items]);
  const params = useGlobalSearchParams();
  const areaId = activeAreaId(pathname, items, params);
  const itemId = activeItem(pathname, items, params)?.id;
  const chip = showsMonthChip(pathname);
  const title = pageTitleFor(pathname, params);

  const go = useCallback((href: string) => router.push(href as any), [router]);
  const { openAdd: onAdd } = useAddSheet();

  return (
    <View className="flex-1 bg-background dark:bg-zinc-950">
      <SafeAreaView edges={['top', 'left', 'right']} className="flex-1">
        <View className="flex-1 flex-row">
          {ready && mode === 'desktop' ? <Sidebar primary={primary} more={moreItems} activeAreaId={areaId} activeItemId={itemId} onGo={go} onAdd={onAdd} /> : null}
          {ready && mode === 'tablet' ? <SideRail items={primary} activeId={areaId} onGo={go} onAdd={onAdd} onMore={more.show} /> : null}

          <View className="min-w-0 flex-1">
            {ready && mode === 'phone' ? (
              <View testID="top-bar" className="h-14 flex-row items-center gap-2 border-b border-border bg-card pl-4 pr-1 dark:border-zinc-800 dark:bg-zinc-900">
                <Text testID="page-title" role="heading" aria-level={1} numberOfLines={1} className="min-w-0 flex-1 text-lg font-semibold text-foreground dark:text-zinc-50">
                  {title}
                </Text>
                {chip ? <MonthChip /> : null}
                <Pressable testID="more-button" accessibilityRole="button" accessibilityLabel="More" onPress={more.show} className="h-11 w-11 items-center justify-center rounded-md">
                  <NavIcon name="dots-horizontal" />
                </Pressable>
              </View>
            ) : ready ? (
              // C-8: the month-chip row is always reserved from 768 px so every h1 starts at the same offset.
              <View testID="top-bar" className="h-14 flex-row items-end justify-end px-6 lg:px-8">
                {chip ? <MonthChip /> : null}
              </View>
            ) : null}

            <View role="main" className="min-h-0 flex-1 px-4 pb-4 pt-3 md:px-6 md:pt-4 lg:px-8 lg:pt-6">
              <View className="mx-auto w-full max-w-[1200px] flex-1">
                <Slot />
              </View>
            </View>

            {ready && mode === 'phone' ? <BottomBar items={primary} activeId={areaId} onGo={go} onAdd={onAdd} /> : null}
          </View>
        </View>
        <MoreSheet open={more.open} items={moreItems} onClose={() => more.hide()} onGo={(href) => more.hide(() => go(href))} />
      </SafeAreaView>
    </View>
  );
}
