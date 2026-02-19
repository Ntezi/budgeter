import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme as useNativeWindColorScheme } from 'nativewind';

type ThemeMode = 'light' | 'dark';

type ThemeContextValue = {
  ready: boolean;
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
};

const STORAGE_KEY = 'budgeter:theme';
const ThemeCtx = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme, setColorScheme } = useNativeWindColorScheme();
  const [ready, setReady] = useState(false);
  const [theme, setThemeState] = useState<ThemeMode>((colorScheme as ThemeMode) ?? 'light');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        const next = stored === 'dark' ? 'dark' : 'light';
        setThemeState(next);
        setColorScheme(next);
      })
      .finally(() => setReady(true));
  }, [setColorScheme]);

  async function setTheme(next: ThemeMode) {
    setThemeState(next);
    setColorScheme(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  }

  async function toggleTheme() {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    await setTheme(next);
  }

  const value = useMemo<ThemeContextValue>(
    () => ({
      ready,
      theme,
      setTheme,
      toggleTheme,
    }),
    [ready, theme]
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useThemeMode() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useThemeMode must be used within <ThemeProvider>');
  return ctx;
}
