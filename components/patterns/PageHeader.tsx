import React, { type ReactNode } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';

type Props = {
  title: string;
  subtitle?: string;
  /** Secondary actions: text links or compact buttons, right of the title. */
  right?: ReactNode;
  /** The screen's one segmented control (Month|Year, Balances|Activity, ...). */
  switcher?: ReactNode;
  /** The one primary action (a PrimaryAction): in the title row from 768 px, under the switcher on a phone. */
  action?: ReactNode;
};

/**
 * Page header, one pattern for every screen (BUDG-8 design review C-1, C-2, C-8, D-2, D-4).
 *
 * Rules (screens must not re-implement them):
 * - Title: below 768 px the shell's top bar shows the page title (lib/shell/nav pageTitleFor), so the
 *   header does not repeat it; from 768 px the title is the h1 here, at the same top offset on every
 *   page (the shell always reserves the month-chip row, with or without a chip).
 * - Switcher: the screen's one segmented control sits directly under the title, left-aligned, full
 *   width on a phone and up to max-w-md from 768 px. Never right-aligned, never beside a button.
 * - Actions: the one primary action is a PrimaryAction (full width on a phone and inside sheets,
 *   compact in the header from 768 px); secondary actions are text links in `right`.
 * - Labels are sentence case, verb + thing ("New month", "Add item").
 */
export function PageHeader({ title, subtitle, right, switcher, action }: Props) {
  const { width } = useWindowDimensions();
  const phone = width < 768;
  const showTitleRow = !phone || !!subtitle || !!right;
  if (!showTitleRow && !switcher && !action) return null;
  return (
    <View className="gap-3" testID="page-header">
      {showTitleRow ? (
        <View className="flex-row flex-wrap items-center gap-3">
          <View className="min-w-0 flex-1 gap-1">
            {!phone ? (
              <Text role="heading" aria-level={1} className="text-2xl font-bold text-foreground dark:text-zinc-50">
                {title}
              </Text>
            ) : null}
            {subtitle ? <Text className="text-sm text-muted-foreground dark:text-zinc-400">{subtitle}</Text> : null}
          </View>
          {right || (!phone && action) ? (
            <View className="flex-row items-center gap-2">
              {right}
              {!phone ? action : null}
            </View>
          ) : null}
        </View>
      ) : null}
      {switcher ? (
        <View testID="page-switcher" className="w-full md:max-w-md">
          {switcher}
        </View>
      ) : null}
      {phone && action ? action : null}
    </View>
  );
}
