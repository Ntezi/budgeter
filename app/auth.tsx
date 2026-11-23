import React, { useEffect, useState } from 'react';
import { Image, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppButton } from '@/components/ui/AppButton';
import { router } from 'expo-router';
import { takePlanAfterSignIn } from '@/components/onboarding/planIntent';
import { useAuth, useAuthUser } from '@/providers/AuthProvider';
import { useThemeMode } from '@/providers/ThemeProvider';

const BENEFITS = [
  { icon: 'calendar-month-outline' as const, text: 'Plan the month' },
  { icon: 'plus-circle-outline' as const, text: 'Add a cost in seconds' },
  { icon: 'cart-outline' as const, text: 'Share a shopping list' },
];

/** BUDG-8 01: phone = headline top, Google button in the bottom third; desktop = two halves. Same handler. */
export default function AuthScreen() {
  const { signInGoogle } = useAuth();
  const { theme } = useThemeMode();
  const { width } = useWindowDimensions();
  const desktop = width >= 1024;
  const user = useAuthUser();
  const [pending, setPending] = useState(false);

  // Onboarding step 3 ("Plan <Month>"): once signed in, open Plan with the New month sheet. The root gate
  // sends a fresh sign-in to Home in the same commit, so this replace runs just after it.
  useEffect(() => {
    if (!user || !takePlanAfterSignIn()) return;
    setTimeout(() => router.replace('/budgets?new=1' as never), 50);
  }, [user]);
  const [error, setError] = useState<string | null>(null);

  async function onSignIn() {
    setError(null);
    setPending(true);
    try {
      await signInGoogle();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sign in failed.');
    } finally {
      setPending(false);
    }
  }

  const blocked = Boolean(error && /popup[-_ ]blocked/i.test(error));
  const logo =
    theme === 'dark'
      ? require('../assets/images/logo/budgeter_logo_white_280x72.png')
      : require('../assets/images/logo/budgeter_logo_black_280x72.png');

  const signIn = (
    <View testID="auth-signin" className="w-full gap-3">
      <AppButton
        onPress={onSignIn}
        disabled={pending}
        variant="outline"
        size="touch-lg"
        accessibilityLabel="Continue with Google"
        className="relative w-full justify-center"
      >
        <View className="absolute left-4">
          <MaterialCommunityIcons name="google" size={20} color="#EA4335" />
        </View>
        <Text className="text-base font-medium text-foreground dark:text-zinc-50">{pending ? 'Signing in…' : 'Continue with Google'}</Text>
      </AppButton>
      {error ? (
        <View role="alert" className="gap-1">
          <Text className="text-sm text-red-600 dark:text-red-300">
            {blocked ? 'Your browser blocked the sign-in window. Allow pop-ups and try again.' : "Sign-in didn't finish. Try again."}
          </Text>
          {!blocked ? <Text className="text-sm text-muted-foreground dark:text-zinc-400">{error}</Text> : null}
        </View>
      ) : null}
      <Text className="text-xs text-muted-foreground dark:text-zinc-400">By clicking continue, you agree to our Terms of Service and Privacy Policy.</Text>
    </View>
  );

  const intro = (
    <View className="gap-6">
      <Image source={logo} style={{ width: 200, height: 52 }} resizeMode="contain" accessibilityLabel="Budgeta" />
      <View className="gap-2">
        <Text role="heading" aria-level={1} className="text-2xl font-bold text-foreground dark:text-zinc-50">
          Know where your money goes, month by month.
        </Text>
        <Text className="text-base text-muted-foreground dark:text-zinc-400">Plan, spend, shop together.</Text>
      </View>
      {desktop ? (
        <View className="gap-3">
          {BENEFITS.map((b) => (
            <View key={b.text} className="flex-row items-center gap-3">
              <MaterialCommunityIcons name={b.icon} size={22} color="#717182" />
              <Text className="text-base text-foreground dark:text-zinc-50">{b.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  if (desktop) {
    return (
      <View testID="auth-screen" className="flex-1 flex-row bg-background dark:bg-zinc-950">
        <View className="flex-1 justify-center bg-muted/50 px-16 dark:bg-zinc-900">{intro}</View>
        <View className="flex-1 items-center justify-center px-16">
          <View className="w-full max-w-sm gap-4 rounded-xl border border-border bg-card p-8 dark:border-zinc-800 dark:bg-zinc-900">
            <Text className="text-xl font-semibold text-foreground dark:text-zinc-50">Sign in</Text>
            {signIn}
          </View>
        </View>
      </View>
    );
  }
  return (
    <ScrollView testID="auth-screen" className="flex-1 bg-background dark:bg-zinc-950" contentContainerClassName="min-h-full px-5 pb-8 pt-16">
      <View className="w-full flex-1 justify-between gap-10 self-center" style={{ maxWidth: 448 }}>
        {intro}
        {signIn}
      </View>
    </ScrollView>
  );
}
