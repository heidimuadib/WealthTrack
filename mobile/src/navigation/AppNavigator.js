import React, { useEffect, useMemo } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Home, List, Plus, PieChart, Settings } from 'lucide-react-native';

import HomeScreen from '../screens/HomeScreen';
import ExpensesScreen from '../screens/ExpensesScreen';
import AddExpenseScreen from '../screens/AddExpenseScreen';
import BudgetScreen from '../screens/BudgetScreen';
import SettingsScreen from '../screens/SettingsScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import ReportsScreen from '../screens/ReportsScreen';
import LoginScreen from '../screens/LoginScreen';
import BrandMark from '../components/BrandMark';

import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import useAuthStore from '../store/authStore';
import { restoreSession } from '../services/session';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// React Navigation paints the gap between screens during a transition, so it
// needs the palette too — otherwise a white flash shows through every push in
// dark mode.
const buildNavTheme = ({ colors, isDark }) => {
    const base = isDark ? DarkTheme : DefaultTheme;

    return {
        ...base,
        colors: {
            ...base.colors,
            background: colors.canvas,
            card: colors.surface,
            primary: colors.brand,
            border: colors.border,
            text: colors.textPrimary,
        },
    };
};

const MainTabs = () => {
    const theme = useTheme();
    const { colors } = theme;
    const { t } = useLanguage();
    const styles = useMemo(() => createStyles(theme), [theme]);

    return (
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
            options={{
                tabBarLabel: t('tabs.home'),
                tabBarIcon: ({ color }) => <Home color={color} size={21} />,
            }}
        />
        <Tab.Screen
            name="Expenses"
            component={ExpensesScreen}
            options={{
                tabBarLabel: t('tabs.expenses'),
                tabBarIcon: ({ color }) => <List color={color} size={21} />,
            }}
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
            options={{
                tabBarLabel: t('tabs.budget'),
                tabBarIcon: ({ color }) => <PieChart color={color} size={21} />,
            }}
        />
        <Tab.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
                tabBarLabel: t('tabs.settings'),
                tabBarIcon: ({ color }) => <Settings color={color} size={21} />,
            }}
        />
    </Tab.Navigator>
    );
};

const SplashScreen = () => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);

    return (
        <View style={styles.splash}>
            <View style={styles.splashMark}>
                <BrandMark color={colors.onBrand} size={30} />
            </View>
            <Text style={styles.splashName}>WealthTrack</Text>
            <ActivityIndicator color={colors.brand} />
        </View>
    );
};

const AppNavigator = () => {
    const theme = useTheme();
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const isRestoring = useAuthStore((state) => state.isRestoring);

    const navTheme = useMemo(() => buildNavTheme(theme), [theme]);

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
            {/* Dark canvas needs light status bar icons, and vice versa. */}
            <StatusBar
                barStyle={theme.isDark ? 'light-content' : 'dark-content'}
                backgroundColor={theme.colors.canvas}
            />
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {isAuthenticated ? (
                    <>
                        <Stack.Screen name="Main" component={MainTabs} />
                        {/* Pushed above the tabs so they can be reached from
                            any tab without nesting a stack inside each one. */}
                        <Stack.Screen name="EditExpense" component={AddExpenseScreen} />
                        <Stack.Screen name="Categories" component={CategoriesScreen} />
                        <Stack.Screen name="Reports" component={ReportsScreen} />
                    </>
                ) : (
                    <Stack.Screen name="Login" component={LoginScreen} />
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
};

const createStyles = ({ colors }) =>
    StyleSheet.create({
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
        fontFamily: 'SpaceGrotesk-Bold',
        letterSpacing: -0.4,
        color: colors.textPrimary,
        marginBottom: spacing.xl,
    },
    });

export default AppNavigator;
