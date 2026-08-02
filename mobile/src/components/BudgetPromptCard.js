import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { Target, X } from 'lucide-react-native';

import Card from './Card';
import Button from './Button';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { useReducedMotion } from '../hooks/useReducedMotion';
import haptics from '../services/haptics';

// An inline card on the dashboard rather than a modal. A budget is worth
// suggesting, not worth blocking the screen over — someone who opened the app
// to record a jeepney fare should be able to do that and read this afterwards.
//
// The copy offers a reason rather than an instruction. "Set a budget" tells
// somebody what to press; saying what a budget gets them tells them why they
// would want to, which is the part that makes the feature stick.
const EXIT_MS = 190;

const BudgetPromptCard = ({ onSetBudget, onDismiss, style }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();
    const reducedMotion = useReducedMotion();

    // 1 while present, 0 once dismissed. Drives opacity and height together so
    // the card shrinks out of the layout instead of vanishing and letting
    // everything below it snap upwards.
    const progress = useRef(new Animated.Value(1)).current;
    const exit = useRef(null);
    const [height, setHeight] = useState(null);
    const [leaving, setLeaving] = useState(false);
    // A ref as well as the state, because they answer different questions at
    // different times. `leaving` drives the render; this one has to be true the
    // instant the first tap lands, since three quick taps are batched into one
    // render and would otherwise all see the state still false — and all three
    // would buzz.
    const dismissing = useRef(false);

    useEffect(
        () => () => {
            // The dashboard can be left mid-dismissal; the animation must not
            // outlive the card driving it.
            exit.current?.stop();
        },
        []
    );

    const handleDismiss = useCallback(() => {
        // Guarded rather than merely debounced: a second tap during the exit
        // would start a second animation and dismiss twice.
        if (dismissing.current) {
            return;
        }

        dismissing.current = true;
        haptics.light();

        // Nothing to collapse if the height was never measured, and nothing to
        // animate if the user has asked for less motion. Both go straight to
        // the outcome rather than to a degraded version of the animation.
        if (reducedMotion || height === null) {
            onDismiss();
            return;
        }

        setLeaving(true);
        exit.current = Animated.timing(progress, {
            toValue: 0,
            duration: EXIT_MS,
            easing: Easing.out(Easing.quad),
            // Height cannot be driven natively, and opacity is riding the same
            // value. One short one-shot on one view, not a loop.
            useNativeDriver: false,
        });
        exit.current.start(({ finished }) => {
            if (finished) {
                onDismiss();
            }
        });
    }, [reducedMotion, height, onDismiss, progress]);

    return (
        <Animated.View
            // Measured once. The wrapper's height includes the card's own
            // bottom margin, so collapsing it takes the spacing with it.
            onLayout={(event) => {
                if (height === null) {
                    setHeight(event.nativeEvent.layout.height);
                }
            }}
            style={[
                styles.wrap,
                leaving && height !== null
                    ? {
                          opacity: progress,
                          height: progress.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, height],
                          }),
                      }
                    : null,
            ]}
        >
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
                        onPress={handleDismiss}
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
        </Animated.View>
    );
};

// The close control is an 18px icon, so the target is made up rather than drawn.
const hitSlop = { top: 14, bottom: 14, left: 14, right: 14 };

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
        wrap: {
            overflow: 'hidden',
        },
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
