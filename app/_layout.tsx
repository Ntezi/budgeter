import React from 'react';
import {Stack} from 'expo-router';
import {SafeAreaProvider} from "react-native-safe-area-context";
import {AuthProvider} from "@/providers/AuthProvider";

import * as tslib from 'tslib';
console.log('tslib.__extends exists:', typeof tslib.__extends === 'function');


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
