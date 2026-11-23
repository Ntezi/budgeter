import { Platform } from 'react-native';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import type { Auth, User } from 'firebase/auth';
import { firebaseConfig } from './firebaseConfig';
import { resolveFirebaseTarget } from './firebaseEmulator';

// Guard first (ADR-2): throws before any Firebase request when the emulator flag,
// project id and host do not agree. Direct process.env reads so Expo inlines them.
export const firebaseTarget = resolveFirebaseTarget({
  useEmulators: process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS,
  projectId: firebaseConfig.projectId,
  host: process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST,
  authPort: process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT,
  firestorePort: process.env.EXPO_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT,
});

export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);

const emulatorFlags = globalThis as typeof globalThis & { __budgetaFirestoreEmulator?: boolean };
if (firebaseTarget.useEmulators && !emulatorFlags.__budgetaFirestoreEmulator) {
  connectFirestoreEmulator(db, firebaseTarget.host, firebaseTarget.firestorePort);
  emulatorFlags.__budgetaFirestoreEmulator = true;
}

let authPromise: Promise<Auth> | null = null;

async function loadAuth(): Promise<Auth> {
  const { getAuth, connectAuthEmulator } = await import('firebase/auth');
  const auth = getAuth(app);
  if (firebaseTarget.useEmulators && !auth.emulatorConfig) {
    connectAuthEmulator(auth, `http://${firebaseTarget.host}:${firebaseTarget.authPort}`, { disableWarnings: true });
  }
  return auth;
}

export function getAuthInstance(): Promise<Auth> {
  if (authPromise) return authPromise;

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') {
      authPromise = Promise.reject(new Error('Auth not available during SSR'));
      return authPromise;
    }
    authPromise = loadAuth();
    return authPromise;
  }

  // Native path: use default auth initialization from the installed Firebase package.
  authPromise = loadAuth();

  return authPromise;
}

// Emulator mode only: lets local end-to-end tests sign in as a seeded synthetic
// user without the Google popup. Never defined against a real project.
if (firebaseTarget.useEmulators && Platform.OS === 'web' && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__budgetaEmulatorSignIn = async (email: string, password: string) => {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    const auth = await getAuthInstance();
    await signInWithEmailAndPassword(auth, email, password);
    return auth.currentUser?.uid ?? null;
  };
}

export type { User };
