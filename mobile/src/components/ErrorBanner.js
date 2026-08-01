import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CloudOff, TriangleAlert } from 'lucide-react-native';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { isOffline, errorMessage } from '../utils/error';

// Used when a screen already has data on it and a later refresh failed. Wiping
// the screen for a full ErrorState would throw away figures that are still
// worth reading — this just says they may be stale, without hiding them.
const ErrorBanner = ({ error, onRetry, style }) => {
    const theme = useTheme();
    const { t } = useLanguage();
    const styles = useMemo(() => createStyles(theme), [theme]);

    const Icon = isOffline(error) ? CloudOff : TriangleAlert;

    return (
        <View style={[styles.container, style]}>
            <Icon color={theme.colors.danger} size={16} />
            <Text style={styles.text} numberOfLines={2}>
                {errorMessage(error)}
            </Text>

            {onRetry ? (
                <TouchableOpacity onPress={onRetry} hitSlop={hitSlop}>
                    <Text style={styles.action}>{t('errors.retry')}</Text>
                </TouchableOpacity>
            ) : null}
        </View>
    );
};

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

const createStyles = ({ colors }) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.dangerTint,
            borderRadius: radius.m,
            paddingVertical: spacing.m,
            paddingHorizontal: spacing.l,
        },
        text: {
            flex: 1,
            marginLeft: spacing.m,
            fontSize: 13,
            lineHeight: 18,
            color: colors.danger,
        },
        action: {
            marginLeft: spacing.m,
            fontSize: 12,
            fontWeight: '700',
            letterSpacing: 0.5,
            color: colors.danger,
        },
    });

export default ErrorBanner;
