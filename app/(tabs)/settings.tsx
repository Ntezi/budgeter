import React from 'react';
import {View, Text, Button} from 'react-native';
import {useAuth, useAuthUser} from "@/providers/AuthProvider";

export default function Settings() {
    const user = useAuthUser();
    const {signOut} = useAuth();
    return (
        <View style={{padding: 16, gap: 12}}>
            <Text>User: {user?.email ?? '(Google user)'}</Text>
            <Button title="Sign out" onPress={signOut}/>
        </View>
    );
}
