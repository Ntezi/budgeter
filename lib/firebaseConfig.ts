type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing Firebase env "${name}". Set EXPO_PUBLIC_FIREBASE_* values in your environment.`
    );
  }
  const placeholders = ['YOUR_KEY', 'YOUR_PROJECT', 'xxxxxxxxxxxxxx', '000000000000'];
  if (placeholders.some((token) => value.includes(token))) {
    throw new Error(
      `Invalid Firebase env "${name}": placeholder value detected. Replace .env.example values with real Firebase web app config.`
    );
  }
  return value;
}

export const firebaseConfig: FirebaseConfig = {
  apiKey: requireEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: requireEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: requireEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: requireEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requireEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requireEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};
