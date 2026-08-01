import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import {
    Tag,
    LogOut,
    ChevronRight,
    BarChart3,
    Info,
    Smartphone,
    Sun,
    Moon,
} from 'lucide-react-native';

import Card from '../components/Card';
import ScreenHeader from '../components/ScreenHeader';
import { useFeedback } from '../components/FeedbackProvider';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage, LANGUAGES } from '../i18n';
import useAuthStore from '../store/authStore';

// "System" first, because following the device is the default and the option
// most people want. Labels are translation keys, resolved at render.
const THEME_OPTIONS = [
    { value: 'system', labelKey: 'settings.system', icon: Smartphone },
    { value: 'light', labelKey: 'settings.light', icon: Sun },
    { value: 'dark', labelKey: 'settings.dark', icon: Moon },
];

const SettingsScreen = ({ navigation }) => {
    const theme = useTheme();
    const { colors, typography } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);

    const logout = useAuthStore((state) => state.logout);
    const user = useAuthStore((state) => state.user);
    const { t, language, setLanguage } = useLanguage();

    const { confirm } = useFeedback();

    const handleLogout = async () => {
        const confirmed = await confirm({
            title: t('settings.logoutTitle'),
            message: t('settings.logoutMsg'),
            confirmLabel: t('settings.logout'),
            destructive: true,
        });

        if (confirmed) {
            logout();
        }
    };

    const initial = user?.name?.trim()?.charAt(0)?.toUpperCase() || 'U';

    return (
        <View style={styles.container}>
            <ScreenHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <Card>
                    <TouchableOpacity
                        style={styles.profile}
                        onPress={() => navigation.navigate('EditProfile')}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={t('editProfile.title')}
                    >
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{initial}</Text>
                        </View>
                        <View style={styles.profileText}>
                            <Text style={styles.name}>{user?.name || 'Your account'}</Text>
                            <Text style={typography.caption}>{user?.email || ''}</Text>
                        </View>
                        <ChevronRight color={colors.textMuted} size={18} />
                    </TouchableOpacity>
                </Card>

                <Text style={styles.sectionTitle}>{t('settings.manage')}</Text>
                <Card padded={false}>
                    <TouchableOpacity
                        style={styles.row}
                        onPress={() => navigation.navigate('Reports')}
                        activeOpacity={0.7}
                    >
                        <View style={styles.rowIcon}>
                            <BarChart3 color={colors.brand} size={18} />
                        </View>
                        <View style={styles.rowMain}>
                            <Text style={styles.rowTitle}>{t('settings.reports')}</Text>
                            <Text style={styles.rowMeta}>{t('settings.reportsMeta')}</Text>
                        </View>
                        <ChevronRight color={colors.textMuted} size={18} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.row, styles.rowDivider]}
                        onPress={() => navigation.navigate('Categories')}
                        activeOpacity={0.7}
                    >
                        <View style={styles.rowIcon}>
                            <Tag color={colors.brand} size={18} />
                        </View>
                        <View style={styles.rowMain}>
                            <Text style={styles.rowTitle}>{t('settings.categories')}</Text>
                            <Text style={styles.rowMeta}>{t('settings.categoriesMeta')}</Text>
                        </View>
                        <ChevronRight color={colors.textMuted} size={18} />
                    </TouchableOpacity>
                </Card>

                <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
                <Card>
                    <View style={styles.segmented}>
                        {LANGUAGES.map((option) => {
                            const active = language === option.code;

                            return (
                                <TouchableOpacity
                                    key={option.code}
                                    style={[styles.segment, active && styles.segmentActive]}
                                    onPress={() => setLanguage(option.code)}
                                    activeOpacity={0.75}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: active }}
                                    accessibilityLabel={option.label}
                                >
                                    <Text
                                        style={[
                                            styles.segmentLabel,
                                            styles.segmentLabelBare,
                                            active && styles.segmentLabelActive,
                                        ]}
                                    >
                                        {option.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    <Text style={styles.help}>{t('settings.languageMeta')}</Text>
                </Card>

                <Text style={styles.sectionTitle}>{t('settings.appearance')}</Text>
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
                                    accessibilityLabel={t(option.labelKey)}
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
                                        {t(option.labelKey)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    <Text style={styles.help}>
                        {theme.preference === 'system'
                            ? t('settings.followingDevice')
                            : theme.isDark
                              ? t('settings.alwaysDark')
                              : t('settings.alwaysLight')}
                    </Text>
                </Card>

                <Text style={styles.sectionTitle}>{t('settings.about')}</Text>
                <Card>
                    <View style={styles.aboutRow}>
                        <Info color={colors.textMuted} size={16} />
                        <Text style={styles.aboutText}>{t('settings.aboutText')}</Text>
                    </View>
                </Card>

                <TouchableOpacity
                    style={styles.logout}
                    onPress={handleLogout}
                    activeOpacity={0.7}
                >
                    <LogOut color={colors.onDanger} size={18} />
                    <Text style={styles.logoutText}>{t('settings.logout')}</Text>
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
    rowDivider: {
        borderTopWidth: 1,
        borderTopColor: colors.border,
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
    // Language segments carry no icon, so the icon gap goes too.
    segmentLabelBare: {
        marginLeft: 0,
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
        backgroundColor: colors.danger,
    },
    logoutText: {
        marginLeft: spacing.s,
        fontSize: 15,
        fontWeight: '600',
        color: colors.onDanger,
    },
    });

export default SettingsScreen;
