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
    <View className="flex-1 items-center justify-center bg-background px-5 dark:bg-slate-950">
      <AppCard className="w-full max-w-md gap-5 px-6 py-8 md:px-8">
        <View className="items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-xl bg-primary dark:bg-slate-100">
            <Text className="text-xl font-bold text-primary-foreground dark:text-slate-900">B</Text>
          </View>
          <Text className="text-2xl font-bold text-foreground dark:text-slate-100">Sign in to Budgeter</Text>
          <Text className="text-center text-sm text-muted-foreground">Use your Google account to continue.</Text>
        </View>

        <AppButton
          onPress={onSignIn}
          disabled={pending}
          variant="outline"
          className="h-12 flex-row items-center justify-center gap-2"
        >
          <MaterialCommunityIcons name="google" size={20} color="#EA4335" />
          <Text className="text-sm font-semibold text-foreground dark:text-slate-100">
            {pending ? 'Signing in...' : 'Continue with Google'}
          </Text>
        </AppButton>

        {error ? <Text className="text-center text-sm text-red-600 dark:text-red-300">{error}</Text> : null}

        <Text className="text-center text-xs text-muted-foreground">
          By continuing, you agree to your organization’s terms and privacy policy.
        </Text>
      </AppCard>
    </View>
  );
}
