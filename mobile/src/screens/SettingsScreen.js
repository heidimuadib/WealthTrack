import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import {
    Tag,
    LogOut,
    ChevronRight,
    Info,
    Smartphone,
    Sun,
    Moon,
} from 'lucide-react-native';

import Card from '../components/Card';
import ScreenHeader from '../components/ScreenHeader';
import { useFeedback } from '../components/FeedbackProvider';
import { radius, spacing, useTheme } from '../theme';
import useAuthStore from '../store/authStore';

// "System" first, because following the device is the default and the option
// most people want.
const THEME_OPTIONS = [
    { value: 'system', label: 'System', icon: Smartphone },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
];

const SettingsScreen = ({ navigation }) => {
    const theme = useTheme();
    const { colors, typography } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);

    const logout = useAuthStore((state) => state.logout);
    const user = useAuthStore((state) => state.user);

    const { confirm } = useFeedback();

    const handleLogout = async () => {
        const confirmed = await confirm({
            title: 'Log out?',
            message: 'You will need to sign in again.',
            confirmLabel: 'Log out',
            destructive: true,
        });

        if (confirmed) {
            logout();
        }
    };

    const initial = user?.name?.trim()?.charAt(0)?.toUpperCase() || 'U';

    return (
        <View style={styles.container}>
            <ScreenHeader title="Settings" subtitle="Your account" />

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <Card>
                    <View style={styles.profile}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{initial}</Text>
                        </View>
                        <View style={styles.profileText}>
                            <Text style={styles.name}>{user?.name || 'Your account'}</Text>
                            <Text style={typography.caption}>{user?.email || ''}</Text>
                        </View>
                    </View>
                </Card>

                <Text style={styles.sectionTitle}>Manage</Text>
                <Card padded={false}>
                    <TouchableOpacity
                        style={styles.row}
                        onPress={() => navigation.navigate('Categories')}
                        activeOpacity={0.7}
                    >
                        <View style={styles.rowIcon}>
                            <Tag color={colors.brand} size={18} />
                        </View>
                        <View style={styles.rowMain}>
                            <Text style={styles.rowTitle}>Categories</Text>
                            <Text style={styles.rowMeta}>Add, rename, or remove categories</Text>
                        </View>
                        <ChevronRight color={colors.textMuted} size={18} />
                    </TouchableOpacity>
                </Card>

                <Text style={styles.sectionTitle}>Appearance</Text>
                <Card>
                    <View style={styles.segmented}>
                        {THEME_OPTIONS.map((option) => {
                            const active = theme.preference === option.value;
                            const Icon = option.icon;

                            return (
                                <TouchableOpacity
                                    key={option.value}
                                    style={[styles.segment, active && styles.segmentActive]}
                                    onPress={() => theme.setPreference(option.value)}
                                    activeOpacity={0.75}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: active }}
                                    accessibilityLabel={`${option.label} appearance`}
                                >
                                    <Icon
                                        color={active ? colors.brand : colors.textMuted}
                                        size={17}
                                    />
                                    <Text
                                        style={[
                                            styles.segmentLabel,
                                            active && styles.segmentLabelActive,
                                        ]}
                                    >
                                        {option.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    <Text style={styles.help}>
                        {theme.preference === 'system'
                            ? 'Following your device setting.'
                            : `Always ${theme.isDark ? 'dark' : 'light'}, whatever the device does.`}
                    </Text>
                </Card>

                <Text style={styles.sectionTitle}>About</Text>
                <Card>
                    <View style={styles.aboutRow}>
                        <Info color={colors.textMuted} size={16} />
                        <Text style={styles.aboutText}>
                            WealthTrack · version 0.1.0{'\n'}
                            Amounts are shown in Philippine pesos.
                        </Text>
                    </View>
                </Card>

                <TouchableOpacity
                    style={styles.logout}
                    onPress={handleLogout}
                    activeOpacity={0.7}
                >
                    <LogOut color={colors.danger} size={18} />
                    <Text style={styles.logoutText}>Log out</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
};

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.canvas,
    },
    content: {
        padding: spacing.l,
        paddingBottom: spacing.xxxl,
    },
    profile: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        width: 52,
        height: 52,
        borderRadius: radius.round,
        backgroundColor: colors.brand,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.l,
    },
    avatarText: {
        color: colors.onBrand,
        fontSize: 20,
        fontWeight: '700',
    },
    profileText: {
        flex: 1,
    },
    name: {
        ...typography.h2,
        marginBottom: 2,
    },
    sectionTitle: {
        ...typography.overline,
        marginTop: spacing.xl,
        marginBottom: spacing.m,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.l,
    },
    rowIcon: {
        width: 38,
        height: 38,
        borderRadius: radius.s,
        backgroundColor: colors.brandTint,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.m,
    },
    rowMain: {
        flex: 1,
    },
    rowTitle: {
        fontSize: 15,
        fontWeight: '500',
        color: colors.textPrimary,
    },
    rowMeta: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
    segmented: {
        flexDirection: 'row',
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.m,
        padding: spacing.xs,
    },
    segment: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.m,
        borderRadius: radius.s,
    },
    segmentActive: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    segmentLabel: {
        marginLeft: spacing.s,
        fontSize: 13,
        fontWeight: '600',
        color: colors.textMuted,
    },
    segmentLabelActive: {
        color: colors.brand,
    },
    help: {
        ...typography.caption,
        marginTop: spacing.m,
        fontSize: 12,
    },
    aboutRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    aboutText: {
        flex: 1,
        marginLeft: spacing.m,
        ...typography.caption,
        lineHeight: 19,
    },
    logout: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: spacing.xxl,
        paddingVertical: spacing.l,
        borderRadius: radius.m,
        backgroundColor: colors.dangerTint,
    },
    logoutText: {
        marginLeft: spacing.s,
        fontSize: 15,
        fontWeight: '600',
        color: colors.danger,
    },
    });

export default SettingsScreen;
