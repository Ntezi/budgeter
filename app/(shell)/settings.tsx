import React from 'react';
import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth, useAuthUser } from '@/providers/AuthProvider';
import { useThemeMode } from '@/providers/ThemeProvider';

export default function SettingsScreen() {
  const user = useAuthUser();
  const { signOut } = useAuth();
  const { theme, setTheme } = useThemeMode();
  const email = user?.email ?? '(Google user)';
  const initials = (email.split('@')[0] || 'BU').slice(0, 2).toUpperCase();

  return (
    <View className="flex-1 gap-5">
      <View className="gap-1">
        <Text className="text-3xl font-bold text-foreground dark:text-zinc-50">Settings</Text>
        <Text className="text-sm text-muted-foreground">Manage your account and preferences.</Text>
      </View>

      <AppCard className="gap-3">
        <Text className="text-base font-semibold text-foreground dark:text-zinc-50">Profile</Text>
        <View className="flex-row items-center gap-3">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-muted dark:bg-zinc-800">
            <Text className="text-lg font-semibold text-foreground dark:text-zinc-50">{initials}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{email}</Text>
            <Text className="text-xs text-muted-foreground">Google account</Text>
          </View>
        </View>
        <AppButton variant="outline" onPress={signOut} className="self-start">
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons name="logout" size={16} color="#D4183D" />
            <Text className="text-sm font-medium text-destructive">Sign Out</Text>
          </View>
        </AppButton>
      </AppCard>

      <AppCard className="gap-3">
        <Text className="text-base font-semibold text-foreground dark:text-zinc-50">Appearance</Text>
        <Text className="text-sm text-muted-foreground">Select your preferred color scheme.</Text>
        <View className="flex-row gap-2">
          <AppButton variant={theme === 'light' ? 'primary' : 'outline'} size="sm" onPress={() => void setTheme('light')}>
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name="weather-sunny" size={16} color={theme === 'light' ? '#FFFFFF' : '#717182'} />
              <Text className={theme === 'light' ? 'text-sm font-medium text-primary-foreground' : 'text-sm font-medium text-foreground dark:text-zinc-50'}>
                Light
              </Text>
            </View>
          </AppButton>
          <AppButton variant={theme === 'dark' ? 'primary' : 'outline'} size="sm" onPress={() => void setTheme('dark')}>
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name="moon-waning-crescent" size={16} color={theme === 'dark' ? '#FFFFFF' : '#717182'} />
              <Text className={theme === 'dark' ? 'text-sm font-medium text-primary-foreground' : 'text-sm font-medium text-foreground dark:text-zinc-50'}>
                Dark
              </Text>
            </View>
          </AppButton>
        </View>
      </AppCard>
    </View>
  );
}
