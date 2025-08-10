import React from 'react';
import {Tabs} from 'expo-router';

export default function TabsLayout() {
    return (
        <Tabs screenOptions={{headerTitleAlign: 'center'}}>
            <Tabs.Screen name="index" options={{title: 'Dashboard'}}/>
            <Tabs.Screen name="transactions" options={{title: 'Transactions'}}/>
            <Tabs.Screen name="budget" options={{title: 'Budget'}}/>
            <Tabs.Screen name="reports" options={{title: 'Reports'}}/>
            <Tabs.Screen name="settings" options={{title: 'Settings'}}/>
        </Tabs>
    );
}
