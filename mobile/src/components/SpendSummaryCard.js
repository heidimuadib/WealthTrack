import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { TrendingUp, TrendingDown, Minus, Plus } from 'lucide-react-native';

import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import {
    currentMonthYear,
    formatCompact,
    formatMonthYear,
    splitCurrency,
} from '../utils/format';

const isSamePeriod = (a, b) => a.month === b.month && a.year === b.year;

// How far ahead of an even daily pace counts as worth flagging. Below this a
// month that is simply front-loaded — rent on the 1st — would read as a warning
// every time, which would train the user to ignore the chip.
const PACE_TOLERANCE = 0.08;

const SpendSummaryCard = ({ period, total, budget, previousTotal, onPressBudget }) => {
    const theme = useTheme();
    const { colors } = theme;
    const { t } = useLanguage();
    const styles = useMemo(() => createStyles(theme), [theme]);

    const hasBudget = budget > 0;
    const remaining = budget - total;
    const isOver = hasBudget && remaining < 0;
    const progress = hasBudget ? total / budget : 0;
    const clamped = Math.max(0, Math.min(progress, 1));
    const percentUsed = hasBudget ? Math.round(progress * 100) : 0;

    // Where an even spend rate would have you by today. Only meaningful while
    // the month is still running — a finished month is measured against its
    // total, not against a date that has already passed.
    const pace = useMemo(() => {
        if (!isSamePeriod(period, currentMonthYear())) {
            return null;
        }
        const now = new Date();
        const daysInMonth = new Date(period.year, period.month, 0).getDate();
        return now.getDate() / daysInMonth;
    }, [period]);

    const amount = splitCurrency(total);

    const delta = useMemo(() => {
        if (previousTotal == null) {
            return null;
        }
        if (total === 0) {
            return { direction: 'flat', text: t('card.nothingYet') };
        }
        if (previousTotal <= 0) {
            return { direction: 'up', text: t('card.nothingLastMonth') };
        }

        const change = (total - previousTotal) / previousTotal;
        const percent = Math.abs(Math.round(change * 100));

        if (percent === 0) {
            return { direction: 'flat', text: t('card.aboutSame') };
        }
        // Past a doubling — or a near-total drop — the percentage stops being
        // the clearer number. "100% less" also reads as nothing at all when a
        // peso was in fact spent, so name last month's figure instead.
        if (percent >= 100) {
            return {
                direction: change > 0 ? 'up' : 'down',
                text: t(change > 0 ? 'card.upFrom' : 'card.downFrom', {
                    amount: formatCompact(previousTotal),
                }),
            };
        }
        return {
            direction: change > 0 ? 'up' : 'down',
            text: t(change > 0 ? 'card.moreThan' : 'card.lessThan', { percent }),
        };
    }, [total, previousTotal, t]);

    const status = useMemo(() => {
        if (!hasBudget) {
            return null;
        }
        if (isOver) {
            return t('card.overBudget');
        }
        if (pace != null && progress > pace + PACE_TOLERANCE) {
            return t('card.aheadOfPace');
        }
        return t('card.onTrack');
    }, [hasBudget, isOver, pace, progress, t]);

    // Animated on change rather than on mount only, so switching months slides
    // the meter to its new value instead of cutting to it.
    const fill = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fill, {
            toValue: clamped,
            duration: 650,
            easing: Easing.out(Easing.cubic),
            // Width cannot be driven natively.
            useNativeDriver: false,
        }).start();
    }, [clamped, fill]);

    const fillWidth = fill.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
    });

    const label = isSamePeriod(period, currentMonthYear())
        ? t('card.spentThisMonth')
        : t('card.spentIn', { period: formatMonthYear(period.month, period.year) });

    const DeltaIcon =
        delta?.direction === 'up' ? TrendingUp : delta?.direction === 'down' ? TrendingDown : Minus;

    return (
        <TouchableOpacity
            style={styles.shell}
            onPress={onPressBudget}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel={
                hasBudget
                    ? `${label}, ${amount.symbol}${amount.whole}. ${percentUsed} percent of your ${formatCompact(budget)} budget used.`
                    : `${label}, ${amount.symbol}${amount.whole}. No budget set.`
            }
            accessibilityHint={t('card.opensBudget')}
        >
            <LinearGradient
                colors={theme.balanceGradient}
                {...theme.gradientAngles.diagonal}
                style={styles.card}
            >
                {/* A single soft highlight across the top-left gives the flat
                    gradient some curvature without adding a second colour. */}
                <LinearGradient
                    colors={[colors.onBrandSheen, 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.85, y: 0.9 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                />

                <View style={styles.head}>
                    <Text style={styles.label}>{label}</Text>
                    {status ? (
                        <View style={styles.chip}>
                            <View
                                style={[
                                    styles.chipDot,
                                    { backgroundColor: isOver ? colors.onBrandOver : colors.onBrand },
                                ]}
                            />
                            <Text style={styles.chipText}>{status}</Text>
                        </View>
                    ) : null}
                </View>

                <View style={styles.amountRow}>
                    <Text style={styles.symbol}>{amount.sign}{amount.symbol}</Text>
                    <Text style={styles.whole}>{amount.whole}</Text>
                    <Text style={styles.fraction}>{amount.fraction}</Text>
                </View>

                <View style={styles.deltaRow}>
                    {delta ? (
                        <>
                            <DeltaIcon color={colors.textOnBrandMuted} size={13} />
                            <Text style={styles.deltaText}>{delta.text}</Text>
                        </>
                    ) : null}
                </View>

                {hasBudget ? (
                    <>
                        <View style={styles.meter}>
                            <View style={styles.track}>
                                <Animated.View
                                    style={[
                                        styles.fill,
                                        {
                                            width: fillWidth,
                                            backgroundColor: isOver
                                                ? colors.onBrandOver
                                                : colors.onBrand,
                                        },
                                    ]}
                                />
                            </View>

                            {/* Where an even daily pace would put you today, so
                                the bar answers "am I early or late" and not just
                                "how much is gone". */}
                            {pace != null && pace < 1 ? (
                                <View
                                    style={[styles.pace, { left: `${pace * 100}%` }]}
                                    pointerEvents="none"
                                />
                            ) : null}
                        </View>

                        <View style={styles.footer}>
                            <Text style={styles.footerLeft}>
                                {isOver
                                    ? t('card.overBy', {
                                          over: formatCompact(Math.abs(remaining)),
                                          budget: formatCompact(budget),
                                      })
                                    : t('card.leftOf', {
                                          left: formatCompact(remaining),
                                          budget: formatCompact(budget),
                                      })}
                            </Text>
                            <Text style={styles.footerRight}>
                                {t('card.percentUsed', { percent: percentUsed })}
                            </Text>
                        </View>
                    </>
                ) : (
                    <View style={styles.cta}>
                        <Plus color={colors.onBrand} size={14} />
                        <Text style={styles.ctaText}>{t('card.setBudget')}</Text>
                    </View>
                )}
            </LinearGradient>
        </TouchableOpacity>
    );
};

const createStyles = ({ colors, shadows }) =>
    StyleSheet.create({
        // Shadow sits on the outer view: the gradient clips its children, and a
        // clipping view cannot also cast on iOS.
        shell: {
            borderRadius: radius.xl,
            marginBottom: spacing.xl,
            ...shadows.raised,
        },
        card: {
            borderRadius: radius.xl,
            padding: spacing.xl,
            overflow: 'hidden',
        },
        head: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: spacing.m,
        },
        label: {
            flex: 1,
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 1.3,
            textTransform: 'uppercase',
            color: colors.textOnBrandMuted,
        },
        chip: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.onBrandChip,
            borderRadius: radius.round,
            paddingVertical: 5,
            paddingHorizontal: spacing.m,
            marginLeft: spacing.s,
        },
        chipDot: {
            width: 6,
            height: 6,
            borderRadius: radius.round,
            marginRight: 6,
        },
        chipText: {
            fontSize: 11,
            fontWeight: '600',
            color: colors.onBrand,
        },
        // Baseline-aligned so the symbol and centavos hang off the figure
        // rather than floating beside it.
        amountRow: {
            flexDirection: 'row',
            alignItems: 'baseline',
        },
        symbol: {
            fontSize: 22,
            fontFamily: 'SpaceGrotesk-SemiBold',
            color: colors.textOnBrandMuted,
            marginRight: 2,
        },
        whole: {
            fontSize: 42,
            fontFamily: 'SpaceGrotesk-Bold',
            letterSpacing: -1.4,
            color: colors.onBrand,
        },
        fraction: {
            fontSize: 20,
            fontFamily: 'SpaceGrotesk-SemiBold',
            color: colors.textOnBrandMuted,
        },
        // Held at a fixed height so the card does not jump when last month's
        // figure arrives a moment after this month's.
        deltaRow: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 20,
            marginTop: spacing.xs,
        },
        deltaText: {
            marginLeft: 6,
            fontSize: 12.5,
            color: colors.textOnBrandMuted,
        },
        meter: {
            marginTop: spacing.l,
            justifyContent: 'center',
        },
        track: {
            height: 8,
            borderRadius: radius.round,
            backgroundColor: colors.onBrandTrack,
            overflow: 'hidden',
        },
        fill: {
            height: 8,
            borderRadius: radius.round,
        },
        pace: {
            position: 'absolute',
            width: 2,
            height: 16,
            marginLeft: -1,
            borderRadius: 1,
            backgroundColor: colors.onBrandPace,
        },
        footer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: spacing.m,
        },
        footerLeft: {
            flex: 1,
            fontSize: 13,
            color: colors.textOnBrandMuted,
        },
        footerRight: {
            fontSize: 13,
            fontWeight: '600',
            color: colors.onBrand,
            fontVariant: ['tabular-nums'],
            marginLeft: spacing.m,
        },
        cta: {
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            backgroundColor: colors.onBrandChip,
            borderRadius: radius.round,
            paddingVertical: spacing.s,
            paddingHorizontal: spacing.m,
            marginTop: spacing.l,
        },
        ctaText: {
            marginLeft: 6,
            fontSize: 13,
            fontWeight: '600',
            color: colors.onBrand,
        },
    });

export default SpendSummaryCard;
