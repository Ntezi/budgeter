import React from 'react';
import {View, Text, Button} from 'react-native';
import {useAuthUser} from "@/providers/AuthProvider";
import {signOut} from "@firebase/auth";
import {auth} from "@/lib/firebase";

export default function Settings() {
    const user = useAuthUser();
    return (
        <View style={{padding: 16, gap: 12}}>
            <Text>User: {user?.email ?? '(Google user)'}</Text>
            <Button title="Sign out" onPress={() => signOut(auth)}/>
        </View>
    );
}
