// Navigation shell model (BUDG-8 00 "Information architecture", "Shell"). Data only, so later
// packages slot in by adding an entry here, never by editing the shell components:
//   Year plan   -> { id: 'year-plan', label: 'Year plan', href: '/budgets/year', icon: 'calendar-range', group: 'more', area: 'plan' }
//   Receipts    -> { id: 'receipts', label: 'Receipts', href: '/receipts', icon: 'receipt', group: 'more', area: 'shopping' }
//   Chef view   -> routes outside (shell) stay outside; a shell entry uses `audience: 'chef'`.
// Routes are unchanged; only labels are new (glossary in 00).

export type LayoutMode = 'phone' | 'tablet' | 'desktop';
export type NavGroup = 'primary' | 'more';
export type Audience = 'household' | 'chef';

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: string; // MaterialCommunityIcons name
  group: NavGroup;
  /** Primary area this entry belongs to (highlights that area in the bottom bar / rail). */
  area?: string;
  /** Other route prefixes that belong to this entry. */
  match?: string[];
  audience?: Audience[];
};

const H: Audience[] = ['household'];

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', href: '/dashboard', icon: 'home-outline', group: 'primary', audience: H },
  { id: 'plan', label: 'Plan', href: '/budgets', icon: 'calendar-month-outline', group: 'primary', audience: H },
  { id: 'shopping', label: 'Shopping', href: '/shopping', icon: 'cart-outline', group: 'primary', audience: H },
  { id: 'accounts', label: 'Accounts', href: '/accounts', icon: 'bank-outline', group: 'primary', match: ['/transactions'], audience: H },
  // BUDG-2 year plan: Plan's Year view (route unchanged, ?view=year).
  { id: 'year-plan', label: 'Year plan', href: '/budgets?view=year', icon: 'calendar-range', group: 'more', area: 'plan', audience: H },
  { id: 'reports', label: 'Reports', href: '/reports', icon: 'chart-bar', group: 'more', audience: H },
  { id: 'regular', label: 'Regular costs', href: '/expenses', icon: 'repeat', group: 'more', match: ['/recurring'], audience: H },
  { id: 'catalog', label: 'Catalog', href: '/shopping-items', icon: 'format-list-bulleted-square', group: 'more', area: 'shopping', audience: H },
  { id: 'settings', label: 'Settings', href: '/settings', icon: 'cog-outline', group: 'more', audience: H },
  // BUDG-4 chef: the shared list only (Shopping screen, "Shared with you").
  { id: 'shared', label: 'Shared with you', href: '/shopping', icon: 'chef-hat', group: 'primary', audience: ['chef'] },
];

/** First screen after sign-in (spec 00: Home for the household at every width; the chef's shared list). */
export function firstRouteFor(audience: Audience): string {
  return audience === 'chef' ? CHEF_ROUTE : '/dashboard';
}
export const CHEF_ROUTE = '/shopping';

/**
 * BUDG-6 (decided here, to confirm with the solution-architect): accounts are not typed, so a
 * signed-in user is a chef when someone shares an ACTIVE list with them and they have no
 * household of their own (no month in their own workspace) and no household membership.
 * Anything else is a household user. Unknown (still loading) is null: show no navigation.
 */
export function audienceFor(
  s: { sharedWithMe: number | null; ownMonths: number | null; memberships: number | null },
  /** BUDG-8: this session already showed the chef shell. A chef whose last share ends stays a chef
   *  (and sees "Access ended") until they get a household of their own. */
  wasChef = false
): Audience | null {
  if (s.sharedWithMe == null || s.ownMonths == null || s.memberships == null) return null;
  const noHousehold = s.ownMonths === 0 && s.memberships === 0;
  return noHousehold && (s.sharedWithMe > 0 || wasChef) ? 'chef' : 'household';
}

/** A chef may only be on the shared-list screen. */
export function chefMayOpen(pathname: string): boolean {
  return pathname === CHEF_ROUTE;
}

/** Routes whose screen reads ?month= today; add /accounts, /reports, /budgets/[pid] when S5/S8/S14 do. */
export const MONTH_CHIP_ROUTES = ['/dashboard', '/transactions'];

export const BREAKPOINT_RAIL = 768;
export const BREAKPOINT_SIDEBAR = 1024;

export function layoutFor(width: number): LayoutMode {
  if (width >= BREAKPOINT_SIDEBAR) return 'desktop';
  if (width >= BREAKPOINT_RAIL) return 'tablet';
  return 'phone';
}

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export function visibleItems(audience: Audience = 'household', items: NavItem[] = NAV_ITEMS): NavItem[] {
  return items.filter((it) => !it.audience || it.audience.includes(audience));
}

/** The entry for a route: longest matching prefix wins. */
export function activeItem(pathname: string, items: NavItem[] = NAV_ITEMS): NavItem | undefined {
  let best: { item: NavItem; len: number } | undefined;
  for (const item of items) {
    for (const prefix of [item.href, ...(item.match ?? [])]) {
      if (under(pathname, prefix) && (!best || prefix.length > best.len)) best = { item, len: prefix.length };
    }
  }
  return best?.item;
}

/** The primary area to highlight in the bottom bar / rail / sidebar. */
export function activeAreaId(pathname: string, items: NavItem[] = NAV_ITEMS): string | undefined {
  const item = activeItem(pathname, items);
  if (!item) return undefined;
  return item.group === 'primary' ? item.id : item.area ?? item.id;
}

export function showsMonthChip(pathname: string): boolean {
  return MONTH_CHIP_ROUTES.some((r) => pathname === r);
}

/** Taps from any screen to reach an entry: phone primary 1, phone More entries 2 (More, entry); tablet/desktop 1 except tablet More entries 2. */
export function tapsTo(id: string, mode: LayoutMode, items: NavItem[] = NAV_ITEMS): number {
  const item = items.find((it) => it.id === id);
  if (!item) throw new Error(`Unknown nav item ${id}`);
  if (item.group === 'primary' || mode === 'desktop') return 1;
  return 2;
}
