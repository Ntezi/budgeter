import {ReactNode, useEffect, useState, createContext, useContext} from 'react';
import {View, ActivityIndicator, Button, Platform, Text} from 'react-native';
import {auth, onAuthStateChanged, User} from '@/lib/firebase';
import {GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut,} from "@firebase/auth";

type Ctx = { user: User | null; signOut: () => Promise<void>; signInGoogle: () => Promise<void> };
const AuthCtx = createContext<Ctx>({
    user: null, signOut: async () => {
    }, signInGoogle: async () => {
    }
});
export const useAuthUser = () => useContext(AuthCtx).user;

export function AuthProvider({children}: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            setUser(u ?? null);
            setReady(true);
        });
        return () => unsub();
    }, []);

    async function signInGoogle() {
        if (Platform.OS !== 'web') {
            alert('Google sign-in: native setup coming next. Run on web for now.');
            return;
        }
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({prompt: 'select_account'});
        await signInWithPopup(auth, provider);
    }

    async function signOut() {
        await firebaseSignOut(auth);
    }

    if (!ready) {
        return (
            <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
                <ActivityIndicator/>
            </View>
        );
    }

    if (!user) {
        return (
            <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12}}>
                <Text style={{fontSize: 18, fontWeight: '700'}}>Sign in</Text>
                <Button title="Continue with Google" onPress={signInGoogle}/>
            </View>
        );
    }

    return (
        <AuthCtx.Provider value={{user, signOut, signInGoogle}}>
            {children}
        </AuthCtx.Provider>
    );
}