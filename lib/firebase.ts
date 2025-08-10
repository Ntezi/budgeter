import {Platform} from 'react-native';
import {initializeApp, getApps, getApp} from 'firebase/app';
import {getAuth, onAuthStateChanged, signInAnonymously, type User} from 'firebase/auth';
import {getFirestore} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {firebaseConfig} from './firebaseConfig';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize Auth
let auth = getAuth(app);

if (Platform.OS !== 'web') {
    try {
        // Runtime import avoids TS2307 on some setups
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const {initializeAuth, getReactNativePersistence} = require('firebase/auth/react-native');
        auth = initializeAuth(app, {persistence: getReactNativePersistence(AsyncStorage)});
    } catch {
        // fallback: in-memory persistence
    }
}

export const db = getFirestore(app);
export {app, auth, onAuthStateChanged, signInAnonymously};
export type {User};
