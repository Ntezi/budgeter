import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { getAuthInstance } from '@/lib/firebase';

type AuthContextValue = {
  ready: boolean;
  user: User | null;
  signOut: () => Promise<void>;
  signInGoogle: () => Promise<void>;
};

const AuthCtx = createContext<AuthContextValue | undefined>(undefined);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
};

export const useAuthUser = () => useAuth().user;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    getAuthInstance()
      .then((auth) => {
        if (cancelled) return;
        unsub = onAuthStateChanged(auth, (nextUser) => {
          setUser(nextUser ?? null);
          setReady(true);
        });
      })
      .catch(() => {
        // Allow the app to render an error state from the auth screen.
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);

  async function signInGoogle() {
    if (Platform.OS !== 'web') {
      throw new Error('Google sign-in on native is not configured yet. Please use web for now.');
    }
    const auth = await getAuthInstance();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  }

  async function signOut() {
    const auth = await getAuthInstance();
    await firebaseSignOut(auth);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      signInGoogle,
      signOut,
    }),
    [ready, user]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
