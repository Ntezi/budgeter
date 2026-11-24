import React from 'react';
import { View } from 'react-native';
import { AppSheet } from '@/components/patterns/AppSheet';
import { ListGroup, ListRow } from '@/components/patterns/ListRow';
import { AppButton } from '@/components/ui/AppButton';
import { type NavItem } from '@/lib/shell/nav';
import { NavIcon } from '@/components/shell/NavIcon';
import { WorkspaceSwitcher } from '@/components/shell/WorkspaceSwitcher';
import { useAuth } from '@/providers/AuthProvider';
import { useThemeMode } from '@/providers/ThemeProvider';

type Props = { open: boolean; items: NavItem[]; onClose: () => void; onGo: (href: string) => void };

/** More: Reports, Regular costs, Catalog, Settings, workspace, theme, sign out (BUDG-8 00). */
export function MoreSheet({ open, items, onClose, onGo }: Props) {
  const { theme, setTheme } = useThemeMode();
  const { signOut } = useAuth();
  return (
    <AppSheet open={open} onClose={onClose} title="More" testID="more-sheet">
      <ListGroup>
        {items.map((it) => (
          <ListRow key={it.id} title={it.label} accessibilityLabel={it.label} left={<NavIcon name={it.icon} size={22} />} onPress={() => onGo(it.href)} />
        ))}
      </ListGroup>
      <WorkspaceSwitcher onManage={() => onGo('/settings?page=workspace')} />
      <View className="flex-row gap-2">
        <AppButton label="Light" size="touch" className="flex-1" variant={theme === 'light' ? 'primary' : 'outline'} aria-pressed={theme === 'light'} onPress={() => void setTheme('light')} />
        <AppButton label="Dark" size="touch" className="flex-1" variant={theme === 'dark' ? 'primary' : 'outline'} aria-pressed={theme === 'dark'} onPress={() => void setTheme('dark')} />
      </View>
      <AppButton label="Sign out" variant="ghost" size="touch" onPress={() => void signOut()} />
    </AppSheet>
  );
}
