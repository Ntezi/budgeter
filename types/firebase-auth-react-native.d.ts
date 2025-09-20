declare module 'firebase/auth/react-native' {
  import type { FirebaseApp } from 'firebase/app';
  import type { Auth, Persistence } from 'firebase/auth';

  export function initializeAuth(app: FirebaseApp, deps: { persistence: Persistence | Persistence[] }): Auth;
  export function getReactNativePersistence(storage: unknown): Persistence;
  export * from 'firebase/auth';
}
