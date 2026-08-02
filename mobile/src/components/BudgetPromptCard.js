import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Target, X } from 'lucide-react-native';

import Card from './Card';
import Button from './Button';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';

// An inline card on the dashboard rather than a modal. A budget is worth
// suggesting, not worth blocking the screen over — someone who opened the app
// to record a jeepney fare should be able to do that and read this afterwards.
//
// The copy offers a reason rather than an instruction. "Set a budget" tells
// somebody what to press; saying what a budget gets them tells them why they
// would want to, which is the part that makes the feature stick.
const BudgetPromptCard = ({ onSetBudget, onDismiss, style }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();

    return (
        <Card style={[styles.card, style]}>
            <View style={styles.head}>
                {/* Decorative: the heading beside it already says this. */}
                <View style={styles.icon} importantForAccessibility="no-hide-descendants">
                    <Target color={colors.brand} size={20} />
                </View>

                <Text style={styles.title} accessibilityRole="header">
                    {t('budgetPrompt.title')}
                </Text>

                <TouchableOpacity
                    onPress={onDismiss}
                    style={styles.dismiss}
                    hitSlop={hitSlop}
                    accessibilityRole="button"
                    accessibilityLabel={t('budgetPrompt.dismiss')}
                >
                    <X color={colors.textMuted} size={18} />
                </TouchableOpacity>
            </View>

            <Text style={styles.body}>{t('budgetPrompt.body')}</Text>

            <Button
                title={t('budgetPrompt.action')}
                onPress={onSetBudget}
                variant="subtle"
                style={styles.action}
            />
        </Card>
    );
};

// The close control is a 18px icon, so the target is made up rather than drawn.
const hitSlop = { top: 14, bottom: 14, left: 14, right: 14 };

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
        card: {
            marginBottom: spacing.xl,
        },
        head: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: spacing.m,
        },
        icon: {
            width: 38,
            height: 38,
            borderRadius: radius.s,
            backgroundColor: colors.brandTint,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: spacing.m,
        },
        title: {
            ...typography.h2,
            flex: 1,
        },
        dismiss: {
            width: 28,
            height: 28,
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: spacing.s,
        },
        body: {
            ...typography.caption,
            lineHeight: 20,
        },
        action: {
            marginTop: spacing.l,
        },
    });

export default BudgetPromptCard;
