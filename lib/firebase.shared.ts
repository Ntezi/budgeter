import { Platform } from 'react-native';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import type { Auth, User } from 'firebase/auth';
import { firebaseConfig } from './firebaseConfig';

export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);

let authPromise: Promise<Auth> | null = null;

export function getAuthInstance(): Promise<Auth> {
  if (authPromise) return authPromise;

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') {
      authPromise = Promise.reject(new Error('Auth not available during SSR'));
      return authPromise;
    }
    authPromise = import('firebase/auth').then(({ getAuth }) => getAuth(app));
    return authPromise;
  }

  // Native path: use default auth initialization from the installed Firebase package.
  authPromise = import('firebase/auth').then(({ getAuth }) => getAuth(app));

  return authPromise;
}

export type { User };
