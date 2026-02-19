import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { useAuth } from '@/providers/AuthProvider';

export default function AuthScreen() {
  const { signInGoogle } = useAuth();
  const [pending, setPending] = useState(false);
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

  return (
    <View className="flex-1 items-center justify-center bg-muted/50 px-5 dark:bg-zinc-950">
      <AppCard className="w-full max-w-sm gap-5 px-6 py-8 md:px-8">
        <View className="items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-xl bg-primary dark:bg-zinc-50">
            <Text className="text-xl font-bold text-primary-foreground dark:text-zinc-900">B</Text>
          </View>
          <Text className="text-2xl font-bold text-foreground dark:text-zinc-50">Sign in to Budgeter</Text>
          <Text className="text-center text-sm text-muted-foreground">Welcome back! Please sign in to continue.</Text>
        </View>

        <AppButton
          onPress={onSignIn}
          disabled={pending}
          variant="outline"
          className="relative h-12 w-full justify-center"
        >
          <View className="absolute left-4">
            <MaterialCommunityIcons name="google" size={20} color="#EA4335" />
          </View>
          <Text className="text-base font-medium text-foreground dark:text-zinc-50">
            {pending ? 'Signing in...' : 'Continue with Google'}
          </Text>
        </AppButton>

        {error ? <Text className="text-center text-sm text-red-600 dark:text-red-300">{error}</Text> : null}

        <Text className="text-center text-xs text-muted-foreground">
          By clicking continue, you agree to our Terms of Service and Privacy Policy.
        </Text>
      </AppCard>
    </View>
  );
}
