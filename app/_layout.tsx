import '../global.css';
import React, { useEffect, useMemo, useState } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { ThemeProvider, useThemeMode } from '@/providers/ThemeProvider';
import { WorkspaceProvider, useWorkspace } from '@/providers/WorkspaceProvider';
import { getOnboardingComplete } from '@/lib/onboarding';
import { decideGate } from '@/lib/rules/appGate';
import { firstRouteFor } from '@/lib/shell/nav';

// The navigator mounts only after auth/workspace load, so on web a refresh or deep link
// (e.g. /transactions?month=YYYY-MM) would otherwise fall back to "/". Remember it once.
let pendingReturnPath: string | null = initialDeepLink();

function initialDeepLink() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const { pathname, search } = window.location;
  if (pathname === '/' || pathname.startsWith('/auth') || pathname.startsWith('/onboarding')) return null;
  return `${pathname}${search}`;
}

function currentLocation(pathname: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.pathname}${window.location.search}`;
  return pathname;
}

function AppGate() {
  const { ready: authReady, user } = useAuth();
  const { ready: themeReady } = useThemeMode();
  const { ready: workspaceReady } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  // Spec 00: Home is the first screen at every width; the shell sends a chef on to the shared list.
  const firstShellRoute = firstRouteFor('household');

  const [checkedOnboarding, setCheckedOnboarding] = useState(false);
  const [onboardingComplete, setOnboardingCompleteFlag] = useState(false);

  useEffect(() => {
    let mounted = true;
    getOnboardingComplete()
      .then((value) => {
        if (!mounted) return;
        setOnboardingCompleteFlag(value);
      })
      .finally(() => {
        if (mounted) setCheckedOnboarding(true);
      });
    return () => {
      mounted = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (!authReady || !themeReady || !workspaceReady || !checkedOnboarding) return;

    const decision = decideGate({
      onboardingComplete,
      signedIn: !!user,
      pathname,
      location: currentLocation(pathname),
      pending: pendingReturnPath,
      firstShellRoute,
    });
    pendingReturnPath = decision.pending;
    if (decision.replace) router.replace(decision.replace as any);
  }, [authReady, checkedOnboarding, firstShellRoute, onboardingComplete, pathname, router, themeReady, user, workspaceReady]);

  const loading = useMemo(
    () => !(authReady && themeReady && workspaceReady && checkedOnboarding),
    [authReady, themeReady, workspaceReady, checkedOnboarding]
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background dark:bg-zinc-950">
        <ActivityIndicator size="large" color="#030213" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="(shell)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <WorkspaceProvider>
            <AppGate />
          </WorkspaceProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
