// providers/AuthProvider.tsx
import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { View, ActivityIndicator, Button, Platform, Text } from 'react-native';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { auth } from '@/lib/firebase.web';

type Ctx = { user: User | null; signOut: () => Promise<void>; signInGoogle: () => Promise<void> };
const AuthCtx = createContext<Ctx | undefined>(undefined);

export const useAuth = (): Ctx => {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
};
export const useAuthUser = () => useAuth().user;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // On web, don't run during SSR
    if (Platform.OS === 'web' && typeof window === 'undefined') return;

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setReady(true);
    });
    return unsub;
  }, []);

  async function signInGoogle() {
    if (Platform.OS !== 'web') {
      alert('Google sign-in on native is not configured yet. Please run on web for now.');
      return;
    }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  }

  async function signOut() {
    await firebaseSignOut(auth);
  }

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Sign in</Text>
        <Button title="Continue with Google" onPress={signInGoogle} />
      </View>
    );
  }

  return <AuthCtx.Provider value={{ user, signOut, signInGoogle }}>{children}</AuthCtx.Provider>;
}
