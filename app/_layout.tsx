import React from 'react';
import {Stack} from 'expo-router';
import {SafeAreaProvider} from "react-native-safe-area-context";
import {AuthProvider} from "@/providers/AuthProvider";


export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="budget/[pid]" /> {/* dynamic budget detail */}
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
