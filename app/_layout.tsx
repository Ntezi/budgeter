import '../global.css';
import React, { useEffect, useMemo, useState } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { ThemeProvider, useThemeMode } from '@/providers/ThemeProvider';
import { WorkspaceProvider, useWorkspace } from '@/providers/WorkspaceProvider';
import { getOnboardingComplete } from '@/lib/onboarding';

function AppGate() {
  const { ready: authReady, user } = useAuth();
  const { ready: themeReady } = useThemeMode();
  const { ready: workspaceReady } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();

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

    const isOnboarding = pathname.startsWith('/onboarding');
    const isAuth = pathname.startsWith('/auth');

    if (!onboardingComplete && !isOnboarding) {
      router.replace('/onboarding');
      return;
    }

    if (onboardingComplete && !user && !isAuth) {
      router.replace('/auth');
      return;
    }

    if (onboardingComplete && user && (isOnboarding || isAuth || pathname === '/')) {
      router.replace('/dashboard');
    }
  }, [authReady, checkedOnboarding, onboardingComplete, pathname, router, themeReady, user, workspaceReady]);

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
