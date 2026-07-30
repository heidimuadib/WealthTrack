import React, { useMemo } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { radius, spacing, useTheme } from '../theme';

// Solid brand fill for the primary action, outline for secondary, text-only
// for tertiary. No gradients — that treatment is reserved for the balance card.
const variants = (colors) => ({
    primary: { bg: colors.brand, fg: colors.onBrand, border: 'transparent' },
    secondary: { bg: 'transparent', fg: colors.brand, border: colors.brand },
    subtle: { bg: colors.brandTint, fg: colors.brand, border: 'transparent' },
    ghost: { bg: 'transparent', fg: colors.textSecondary, border: 'transparent' },
    danger: { bg: colors.dangerTint, fg: colors.danger, border: 'transparent' },
});

const Button = ({
    title,
    onPress,
    variant = 'primary',
    size = 'default',
    loading = false,
    disabled = false,
    icon = null,
    style,
}) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const schemes = useMemo(() => variants(theme.colors), [theme]);

    const scheme = schemes[variant] || schemes.primary;
    const isSmall = size === 'small';
    const isInert = loading || disabled;

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={isInert}
            activeOpacity={0.75}
            style={[
                styles.base,
                isSmall && styles.small,
                {
                    backgroundColor: scheme.bg,
                    borderColor: scheme.border,
                    borderWidth: scheme.border === 'transparent' ? 0 : 1.5,
                },
                isInert && styles.inert,
                style,
            ]}
        >
            {loading ? (
                <ActivityIndicator color={scheme.fg} size="small" />
            ) : (
                <View style={styles.content}>
                    {icon ? <View style={styles.icon}>{icon}</View> : null}
                    <Text
                        style={[styles.label, isSmall && styles.labelSmall, { color: scheme.fg }]}
                        numberOfLines={1}
                    >
                        {title}
                    </Text>
                </View>
            )}
        </TouchableOpacity>
    );
};

const createStyles = () =>
    StyleSheet.create({
        base: {
            height: 52,
            borderRadius: radius.m,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: spacing.xl,
        },
        small: {
            height: 40,
            borderRadius: radius.s,
            paddingHorizontal: spacing.l,
        },
        content: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        icon: {
            marginRight: spacing.s,
        },
        label: {
            fontSize: 16,
            fontWeight: '600',
            letterSpacing: 0.1,
        },
        labelSmall: {
            fontSize: 14,
        },
        inert: {
            opacity: 0.5,
        },
    });

export default Button;
