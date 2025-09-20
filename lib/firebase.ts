// lib/firebase.ts
import {Platform} from 'react-native';
import {initializeApp, getApps, getApp, type FirebaseApp} from 'firebase/app';
import {getFirestore} from 'firebase/firestore';
import type {Auth, User} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {firebaseConfig} from './firebaseConfig';

export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);

/**
 * Lazy, singleton Auth instance. Works on web + native.
 * - No static import of `firebase/auth/react-native` (avoids ESLint/TS noise)
 * - On web: don't construct during SSR
 */
let _authPromise: Promise<Auth> | null = null;

export function getAuthInstance(): Promise<Auth> {
    if (_authPromise) return _authPromise;

    if (Platform.OS === 'web') {
        if (typeof window === 'undefined') {
            // SSR phase: caller must skip auth usage
            _authPromise = Promise.reject(new Error('Auth not available during SSR'));
            return _authPromise;
        }
        _authPromise = import('firebase/auth').then(({getAuth}) => getAuth(app));
        return _authPromise;
    }

    // Native: prefer RN bundle (selected via "react-native" export condition); fall back gracefully.
    _authPromise = (async () => {
        try {
            const mod = await import('firebase/auth');
            const initializeAuth = (mod as any).initializeAuth as
                | ((app: FirebaseApp, opts: any) => Auth)
                | undefined;

            // Try to get RN persistence from the same module; if types omit it, fall back to the RN subpath dynamically.
            let getReactNativePersistence =
                (mod as any).getReactNativePersistence as ((storage: any) => any) | undefined;

            if (!getReactNativePersistence) {
                // dynamic string avoids ESLint import/no-unresolved
                const rn = (await import('firebase/auth' + '/react-native')) as any;
                getReactNativePersistence = rn.getReactNativePersistence;
            }

            if (initializeAuth && getReactNativePersistence) {
                return initializeAuth(app, {persistence: getReactNativePersistence(AsyncStorage)});
            }

            // Fallback: memory persistence
            const {getAuth} = await import('firebase/auth');
            return getAuth(app);
        } catch {
            const {getAuth} = await import('firebase/auth');
            return getAuth(app);
        }
    })();

    return _authPromise;
}

export type {User};
