import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import ScreenHeader from '../../components/ScreenHeader';
import { spacing, useTheme } from '../../theme';
import { useLanguage } from '../../i18n';

// The frame every Groups screen will keep, standing in for the screens that
// arrive in the phases after this one.
//
// It exists so the routes can be registered and navigated to now — a route that
// does not resolve is a crash rather than a gap — and so that when a real
// screen replaces one of these, the header, the safe area and the translated
// title are already the ones it will ship with. Only the body changes.
//
// Deliberately translated rather than an English placeholder. A shell is still
// something a person can reach, and the release bundle has no business carrying
// untranslated developer copy on a route the navigator will happily open.
const GroupRouteShell = ({ titleKey, navigation, onBack }) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();

    return (
        <View style={styles.container}>
            <ScreenHeader
                title={t(titleKey)}
                onBack={onBack ?? (navigation ? () => navigation.goBack() : undefined)}
            />

            <View style={styles.body}>
                <Text style={styles.message} accessibilityRole="text">
                    {t('groups.preparing')}
                </Text>
            </View>
        </View>
    );
};

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.canvas,
        },
        body: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing.xl,
        },
        message: {
            ...typography.bodyMuted,
            textAlign: 'center',
        },
    });

export default GroupRouteShell;
