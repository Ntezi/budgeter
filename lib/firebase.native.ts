import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// eslint-disable-next-line import/no-unresolved
import { initializeAuth, getReactNativePersistence } from 'firebase/auth/react-native';
// ^ The RN subpath is correct at runtime; silence ESLint for this line if needed.

import { firebaseConfig } from './firebaseConfig';

export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export type { User } from 'firebase/auth';
