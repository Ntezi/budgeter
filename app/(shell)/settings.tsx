import React from 'react';
import { Text, View } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { useAuth, useAuthUser } from '@/providers/AuthProvider';
import { useThemeMode } from '@/providers/ThemeProvider';

export default function SettingsScreen() {
  const user = useAuthUser();
  const { signOut } = useAuth();
  const { theme, setTheme } = useThemeMode();

  return (
    <View className="flex-1 gap-4">
      <View className="gap-1">
        <Text className="text-3xl font-bold text-foreground dark:text-slate-100">Settings</Text>
        <Text className="text-sm text-muted-foreground">Manage profile, appearance, and account access.</Text>
      </View>

      <AppCard className="gap-3">
        <Text className="text-base font-semibold text-foreground dark:text-slate-100">Profile</Text>
        <Text className="text-sm text-muted-foreground">Signed in as {user?.email ?? '(Google user)'}</Text>
        <View className="flex-row gap-2">
          <AppButton label="Sign Out" variant="destructive" onPress={signOut} />
        </View>
      </AppCard>

      <AppCard className="gap-3">
        <Text className="text-base font-semibold text-foreground dark:text-slate-100">Appearance</Text>
        <Text className="text-sm text-muted-foreground">Choose your preferred theme.</Text>
        <AppSegmented
          value={theme}
          onChange={(value) => void setTheme(value as 'light' | 'dark')}
          options={[
            { label: 'Light', value: 'light' },
            { label: 'Dark', value: 'dark' },
          ]}
        />
      </AppCard>
    </View>
  );
}
