import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Home, List, Plus, PieChart, Settings, Wallet } from 'lucide-react-native';

import HomeScreen from '../screens/HomeScreen';
import ExpensesScreen from '../screens/ExpensesScreen';
import AddExpenseScreen from '../screens/AddExpenseScreen';
import BudgetScreen from '../screens/BudgetScreen';
import SettingsScreen from '../screens/SettingsScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import LoginScreen from '../screens/LoginScreen';

import { colors, radius, spacing } from '../theme';
import useAuthStore from '../store/authStore';
import { restoreSession } from '../services/session';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const navTheme = {
    ...DefaultTheme,
    colors: {
        ...DefaultTheme.colors,
        background: colors.canvas,
        card: colors.surface,
        primary: colors.brand,
        border: colors.border,
        text: colors.textPrimary,
    },
};

const MainTabs = () => (
    <Tab.Navigator
        screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.brand,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarStyle: styles.tabBar,
            tabBarLabelStyle: styles.tabLabel,
            // The manifest uses adjustResize, so an open keyboard shrinks the
            // window and shoves the tab bar up on top of it. Hiding the bar
            // while typing is the fix — and it keeps adjustResize, which is
            // what stops the focused input from ending up behind the keyboard.
            tabBarHideOnKeyboard: true,
        }}
    >
        <Tab.Screen
            name="Home"
            component={HomeScreen}
            options={{ tabBarIcon: ({ color }) => <Home color={color} size={21} /> }}
        />
        <Tab.Screen
            name="Expenses"
            component={ExpensesScreen}
            options={{ tabBarIcon: ({ color }) => <List color={color} size={21} /> }}
        />
        <Tab.Screen
            name="Add"
            component={AddExpenseScreen}
            options={{
                tabBarLabel: '',
                tabBarIcon: () => (
                    <View style={styles.addButton}>
                        <Plus color={colors.onBrand} size={22} />
                    </View>
                ),
            }}
        />
        <Tab.Screen
            name="Budget"
            component={BudgetScreen}
            options={{ tabBarIcon: ({ color }) => <PieChart color={color} size={21} /> }}
        />
        <Tab.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ tabBarIcon: ({ color }) => <Settings color={color} size={21} /> }}
        />
    </Tab.Navigator>
);

const SplashScreen = () => (
    <View style={styles.splash}>
        <View style={styles.splashMark}>
            <Wallet color={colors.onBrand} size={26} />
        </View>
        <Text style={styles.splashName}>WealthTrack</Text>
        <ActivityIndicator color={colors.brand} />
    </View>
);

const AppNavigator = () => {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const isRestoring = useAuthStore((state) => state.isRestoring);

    useEffect(() => {
        restoreSession();
    }, []);

    // Holding here avoids flashing the login screen at a user whose stored
    // session is still being validated.
    if (isRestoring) {
        return <SplashScreen />;
    }

    return (
        <NavigationContainer theme={navTheme}>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {isAuthenticated ? (
                    <>
                        <Stack.Screen name="Main" component={MainTabs} />
                        {/* Pushed above the tabs so they can be reached from
                            any tab without nesting a stack inside each one. */}
                        <Stack.Screen name="EditExpense" component={AddExpenseScreen} />
                        <Stack.Screen name="Categories" component={CategoriesScreen} />
                    </>
                ) : (
                    <Stack.Screen name="Login" component={LoginScreen} />
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
};

const styles = StyleSheet.create({
    tabBar: {
        backgroundColor: colors.surface,
        borderTopColor: colors.border,
        borderTopWidth: 1,
        height: 64,
        paddingTop: spacing.s,
        paddingBottom: spacing.s,
    },
    tabLabel: {
        fontSize: 11,
        fontWeight: '500',
    },
    addButton: {
        width: 46,
        height: 46,
        borderRadius: radius.round,
        backgroundColor: colors.brand,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    splash: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.canvas,
    },
    splashMark: {
        width: 60,
        height: 60,
        borderRadius: radius.l,
        backgroundColor: colors.brand,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.l,
    },
    splashName: {
        fontSize: 20,
        fontWeight: '700',
        letterSpacing: -0.4,
        color: colors.textPrimary,
        marginBottom: spacing.xl,
    },
});

export default AppNavigator;
