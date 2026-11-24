import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemeMode } from '@/providers/ThemeProvider';

export const ICON_MUTED = '#717182';

/** Icon colours from the kept palette: primary / zinc-100 when active, muted otherwise. */
export function NavIcon({ name, active, size = 24 }: { name: string; active?: boolean; size?: number }) {
  const { theme } = useThemeMode();
  const color = active ? (theme === 'dark' ? '#F4F4F5' : '#030213') : ICON_MUTED;
  return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
}

/** Icon on a primary-filled control: white on primary (light), zinc-950 on zinc-50 (dark). */
export function OnPrimaryIcon({ name, size = 28 }: { name: string; size?: number }) {
  const { theme } = useThemeMode();
  return <MaterialCommunityIcons name={name as any} size={size} color={theme === 'dark' ? '#09090B' : '#FFFFFF'} />;
}
