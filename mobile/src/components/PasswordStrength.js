import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';

// Advice, not a gate: the API enforces the eight-character minimum, and a rule
// the user cannot satisfy on their own password manager's output would only
// push them towards something shorter and more memorable.
const score = (password) => {
    if (!password) {
        return 0;
    }

    const tests = [
        password.length >= 8,
        password.length >= 12,
        /[a-z]/.test(password) && /[A-Z]/.test(password),
        /\d/.test(password),
        /[^A-Za-z0-9]/.test(password),
    ];

    return tests.filter(Boolean).length;
};

const PasswordStrength = ({ password }) => {
    const theme = useTheme();
    const { colors } = theme;
    const { t } = useLanguage();
    const styles = useMemo(() => createStyles(theme), [theme]);

    if (!password) {
        return null;
    }

    const points = score(password);
    const level = points <= 1 ? 0 : points <= 3 ? 1 : 2;

    const { label, color } = [
        { label: t('login.weak'), color: colors.danger },
        { label: t('login.fair'), color: colors.warning },
        { label: t('login.strong'), color: colors.success },
    ][level];

    return (
        <View style={styles.container}>
            <View style={styles.bars}>
                {[0, 1, 2].map((index) => (
                    <View
                        key={index}
                        style={[
                            styles.bar,
                            { backgroundColor: index <= level ? color : colors.surfaceAlt },
                        ]}
                    />
                ))}
            </View>
            <Text style={[styles.label, { color }]}>{label}</Text>
        </View>
    );
};

const createStyles = ({ colors }) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: -spacing.s,
            marginBottom: spacing.l,
        },
        bars: {
            flex: 1,
            flexDirection: 'row',
        },
        bar: {
            flex: 1,
            height: 4,
            borderRadius: radius.round,
            marginRight: spacing.xs,
        },
        label: {
            marginLeft: spacing.m,
            fontSize: 12,
            fontWeight: '600',
            width: 48,
            textAlign: 'right',
        },
    });

export default PasswordStrength;
