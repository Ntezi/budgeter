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

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', href: '/dashboard', icon: 'home-outline', group: 'primary' },
  { id: 'plan', label: 'Plan', href: '/budgets', icon: 'calendar-month-outline', group: 'primary' },
  { id: 'shopping', label: 'Shopping', href: '/shopping', icon: 'cart-outline', group: 'primary' },
  { id: 'accounts', label: 'Accounts', href: '/accounts', icon: 'bank-outline', group: 'primary', match: ['/transactions'] },
  { id: 'reports', label: 'Reports', href: '/reports', icon: 'chart-bar', group: 'more' },
  { id: 'regular', label: 'Regular costs', href: '/expenses', icon: 'repeat', group: 'more', match: ['/recurring'] },
  { id: 'catalog', label: 'Catalog', href: '/shopping-items', icon: 'format-list-bulleted-square', group: 'more', area: 'shopping' },
  { id: 'settings', label: 'Settings', href: '/settings', icon: 'cog-outline', group: 'more' },
];

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
