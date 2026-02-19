import React from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { AppButton } from '@/components/ui/AppButton';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6 dark:bg-zinc-950">
      <Text className="text-2xl font-bold text-foreground dark:text-zinc-50">Page not found</Text>
      <Text className="text-center text-sm text-muted-foreground">
        The route you opened does not exist in this app shell.
      </Text>
      <AppButton label="Go to Dashboard" onPress={() => router.replace('/dashboard')} />
    </View>
  );
}
