import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radius, spacing, useTheme } from '../theme';
import Button from './Button';

// Every list in the app had a blank screen when it had no data. This gives
// each one a reason and a next step.
const EmptyState = ({ icon: Icon, title, message, actionLabel, onAction }) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    return (
        <View style={styles.container}>
            {Icon ? (
                <View style={styles.iconWrap}>
                    <Icon color={theme.colors.brand} size={26} />
                </View>
            ) : null}

            <Text style={styles.title}>{title}</Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}

            {actionLabel && onAction ? (
                <Button
                    title={actionLabel}
                    onPress={onAction}
                    variant="subtle"
                    size="small"
                    style={styles.action}
                />
            ) : null}
        </View>
    );
};

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            paddingVertical: spacing.xxxl,
            paddingHorizontal: spacing.xl,
        },
        iconWrap: {
            width: 56,
            height: 56,
            borderRadius: radius.round,
            backgroundColor: colors.brandTint,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: spacing.l,
        },
        title: {
            ...typography.h2,
            textAlign: 'center',
            marginBottom: spacing.xs,
        },
        message: {
            ...typography.caption,
            textAlign: 'center',
            lineHeight: 19,
            maxWidth: 260,
        },
        action: {
            marginTop: spacing.l,
        },
    });

export default EmptyState;
