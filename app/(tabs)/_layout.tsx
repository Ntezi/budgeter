import React from 'react';
import {Tabs} from 'expo-router';

export default function TabsLayout() {
    return (
        <Tabs screenOptions={{headerTitleAlign: 'center'}}>
            <Tabs.Screen name="index" options={{title: 'Dashboard'}}/>
            <Tabs.Screen name="transactions" options={{title: 'Transactions'}}/>
            <Tabs.Screen name="budgets" options={{title: 'Budgets'}}/>
            <Tabs.Screen name="reports" options={{title: 'Reports'}}/>
            <Tabs.Screen name="settings" options={{title: 'Settings'}}/>
            <Tabs.Screen name="recurring" options={{ title: 'Recurring' }} />
        </Tabs>
    );
}
