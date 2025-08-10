import {ReactNode, useEffect, useState, createContext, useContext} from 'react';
import {View, ActivityIndicator} from 'react-native';
import {auth, onAuthStateChanged, signInAnonymously, User} from '../lib/firebase';

type Ctx = { user: User | null };
const AuthCtx = createContext<Ctx>({user: null});
export const useAuthUser = () => useContext(AuthCtx).user;

export function AuthProvider({children}: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (u) => {
            try {
                if (!u) await signInAnonymously(auth);
                setUser(auth.currentUser ?? null);
            } catch (e: any) {
                console.error('Anon sign-in failed:', e.code, e.message);
                alert(`Auth error: ${e.code}`);
            } finally {
                setReady(true);
            }
        });
        return () => unsub();
    }, []);

    if (!ready) {
        return (
            <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
                <ActivityIndicator/>
            </View>
        );
    }
    return <AuthCtx.Provider value={{user}}>{children}</AuthCtx.Provider>;
}
