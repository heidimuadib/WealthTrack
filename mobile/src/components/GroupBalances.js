import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ArrowDownLeft, ArrowUpRight, ArrowRightLeft, CheckCircle2, Scale } from 'lucide-react-native';

import Card from './Card';
import ErrorState from './ErrorState';
import ErrorBanner from './ErrorBanner';
import { SkeletonGroup, SkeletonBlock, SkeletonCard } from './Skeleton';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { formatCurrency } from '../utils/format';
import { resolveViewState, LOADING, ERROR } from '../utils/viewState';
import { pairPerspective, selfTotals, sortPairs, summaryState } from '../utils/balances';

// What the backend's balance engine looks like to somebody who has never heard
// the words "net" or "pairwise".
//
// Nothing here decides a debt. Amounts and directions arrive from
// GET /balances already settled against every repayment, and this component
// formats them, orders them and turns each one into a sentence. Direction is
// carried by words and an arrow, never by a sign and never by colour alone —
// "-₱100" tells a reader nothing about which way the money goes, and a red
// figure tells a colour-blind reader nothing at all.

// One figure with its label, announced together so a screen reader says
// "You're owed ₱400.00" rather than stopping twice on two fragments.
const SummaryFigure = ({ label, amount, a11yKey, tone, styles, colors, t }) => (
    <View
        style={styles.figure}
        accessible
        accessibilityLabel={t(a11yKey, { amount: formatCurrency(amount) })}
    >
        <Text style={styles.figureLabel}>{label}</Text>
        <Text style={[styles.figureAmount, tone && { color: tone }]}>
            {formatCurrency(amount)}
        </Text>
    </View>
);

// Somebody's position said once, in a sentence, with the amount inside it.
// The row is `accessible`, which collapses its children into that single stop —
// the amount is part of the sentence rather than a separate landing point.
const PairRow = ({ pair, currentUserMemberId, styles, colors, t, isLast }) => {
    const view = pairPerspective(pair, currentUserMemberId);
    const amount = formatCurrency(pair.balance);

    const sentence =
        view.kind === 'owedToYou'
            ? t('balances.owesYou', { name: view.otherName })
            : view.kind === 'youOwe'
              ? t('balances.youOweName', { name: view.otherName })
              : t('balances.owesOther', { nameA: view.debtorName, nameB: view.creditorName });

    const a11y =
        view.kind === 'owedToYou'
            ? t('balances.a11yOwesYou', { name: view.otherName, amount })
            : view.kind === 'youOwe'
              ? t('balances.a11yYouOweName', { name: view.otherName, amount })
              : t('balances.a11yOwesOther', {
                    nameA: view.debtorName,
                    nameB: view.creditorName,
                    amount,
                });

    // Shape as well as colour: money coming in, money going out, and money
    // moving between two other people are three different marks.
    const Icon =
        view.kind === 'owedToYou'
            ? ArrowDownLeft
            : view.kind === 'youOwe'
              ? ArrowUpRight
              : ArrowRightLeft;

    const tint =
        view.kind === 'owedToYou'
            ? colors.success
            : view.kind === 'youOwe'
              ? colors.danger
              : colors.textMuted;

    return (
        <View
            style={[styles.pairRow, !isLast && styles.pairDivider]}
            accessible
            accessibilityLabel={a11y}
        >
            <View style={styles.pairIcon} importantForAccessibility="no-hide-descendants">
                <Icon color={tint} size={16} />
            </View>
            <Text style={styles.pairSentence} numberOfLines={2}>
                {sentence}
            </Text>
            <Text style={styles.pairAmount}>{amount}</Text>
        </View>
    );
};

const GroupBalances = ({ query, archived = false, expensesAreKnownEmpty = false }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();

    const balances = query.data;

    // isPending, never isFetching: a refetch over figures already on screen
    // must leave them there. Somebody watching their own balance should not see
    // it replaced by a grey block every time the screen regains focus.
    const state = resolveViewState({
        isPending: query.isPending,
        hasData: balances !== undefined,
        error: query.error,
    });

    const currentUserMemberId = balances?.currentUserMemberId ?? null;

    // Sorted once per response rather than per render: the comparator walks
    // every pair and a long trip has plenty.
    const pairs = useMemo(
        () => sortPairs(balances?.pairs ?? [], currentUserMemberId),
        [balances, currentUserMemberId]
    );

    const totals = useMemo(() => selfTotals(balances), [balances]);
    const mood = useMemo(
        () => summaryState(balances, { expensesAreKnownEmpty }),
        [balances, expensesAreKnownEmpty]
    );

    const heading = (
        <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('balances.title')}
        </Text>
    );

    if (state === LOADING) {
        return (
            <View>
                {heading}
                {/* Shaped like the section it stands in for, and carrying no
                    names, no figures and no debts — a skeleton that invented a
                    peso amount would be read as one. */}
                <SkeletonGroup label={t('loading.balances')}>
                    <SkeletonCard>
                        <View style={styles.skeletonRow}>
                            <SkeletonBlock width={92} height={12} />
                            <SkeletonBlock width={92} height={12} />
                        </View>
                        <View style={styles.skeletonRow}>
                            <SkeletonBlock width={108} height={22} />
                            <SkeletonBlock width={108} height={22} />
                        </View>
                    </SkeletonCard>
                </SkeletonGroup>
            </View>
        );
    }

    // Section-level, deliberately. The group's name, its members and its
    // expenses all loaded; losing the balances is a reason to say so here and
    // offer a retry, not to take the rest of the screen away.
    if (state === ERROR) {
        return (
            <View>
                {heading}
                <Card>
                    <ErrorState error={query.error} onRetry={query.refetch} />
                </Card>
            </View>
        );
    }

    const settled = mood === 'allSettled' || mood === 'noBalances' || mood === 'youSettled';

    const settledCopy = {
        allSettled: ['balances.allSettled', 'balances.allSettledMsg'],
        noBalances: ['balances.none', 'balances.noneMsg'],
        youSettled: ['balances.youSettled', 'balances.youSettledMsg'],
    }[mood];

    return (
        <View>
            {heading}

            {/* Figures already on screen and a refresh that failed: say they
                may be stale rather than throwing them away. */}
            {query.error ? (
                <ErrorBanner error={query.error} onRetry={query.refetch} style={styles.banner} />
            ) : null}

            <Card>
                {archived ? (
                    <View
                        style={styles.archived}
                        accessible
                        accessibilityLabel={t('balances.a11yArchived')}
                    >
                        <Text style={styles.archivedText}>{t('balances.archived')}</Text>
                    </View>
                ) : null}

                {settled ? (
                    // Never "₱0.00 owed, ₱0.00 owed, ₱0.00 net". Three zeroes
                    // are a puzzle; one sentence is an answer.
                    <View style={styles.settled} accessible>
                        <View style={styles.settledIcon} importantForAccessibility="no-hide-descendants">
                            {mood === 'noBalances' ? (
                                <Scale color={colors.textMuted} size={20} />
                            ) : (
                                <CheckCircle2 color={colors.success} size={20} />
                            )}
                        </View>
                        <View style={styles.settledText}>
                            <Text style={styles.settledTitle}>{t(settledCopy[0])}</Text>
                            <Text style={styles.settledMessage}>{t(settledCopy[1])}</Text>
                        </View>
                    </View>
                ) : (
                    <View>
                        {/* Both sides, always. A single net figure hides which
                            way half of somebody's money is pointing. */}
                        <View style={styles.figures}>
                            <SummaryFigure
                                label={t('balances.owedToYou')}
                                amount={totals.owedToYou}
                                a11yKey="balances.a11yOwedToYou"
                                tone={totals.owedToYou > 0 ? colors.success : null}
                                styles={styles}
                                colors={colors}
                                t={t}
                            />
                            <View style={styles.figureDivider} />
                            <SummaryFigure
                                label={t('balances.youOwe')}
                                amount={totals.youOwe}
                                a11yKey="balances.a11yYouOwe"
                                tone={totals.youOwe > 0 ? colors.danger : null}
                                styles={styles}
                                colors={colors}
                                t={t}
                            />
                        </View>

                        {/* Only when both sides carry money. Anywhere else the
                            net simply repeats the one figure above it. */}
                        {mood === 'both' ? (
                            <View
                                style={styles.net}
                                accessible
                                accessibilityLabel={t('balances.a11yNet', {
                                    amount: formatCurrency(totals.net),
                                })}
                            >
                                <Text style={styles.netLabel}>{t('balances.net')}</Text>
                                <Text style={styles.netAmount}>
                                    {formatCurrency(Math.abs(totals.net))}
                                </Text>
                            </View>
                        ) : null}
                    </View>
                )}
            </Card>

            {pairs.length > 0 ? (
                <View>
                    <Text style={styles.sectionTitle} accessibilityRole="header">
                        {t('balances.whoOwesWhom')}
                    </Text>
                    <Card padded={false}>
                        <View style={styles.pairs}>
                            {pairs.map((pair, index) => (
                                <PairRow
                                    key={`${pair.memberAId}-${pair.memberBId}`}
                                    pair={pair}
                                    currentUserMemberId={currentUserMemberId}
                                    isLast={index === pairs.length - 1}
                                    styles={styles}
                                    colors={colors}
                                    t={t}
                                />
                            ))}
                        </View>
                    </Card>
                </View>
            ) : null}
        </View>
    );
};

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
        sectionTitle: {
            ...typography.overline,
            marginTop: spacing.xl,
            marginBottom: spacing.s,
        },
        banner: {
            marginBottom: spacing.s,
        },
        archived: {
            alignSelf: 'flex-start',
            paddingHorizontal: spacing.m,
            paddingVertical: spacing.xs,
            borderRadius: radius.round,
            backgroundColor: colors.surfaceAlt,
            marginBottom: spacing.l,
        },
        archivedText: {
            fontSize: 11,
            fontWeight: '700',
            color: colors.textSecondary,
        },
        figures: {
            flexDirection: 'row',
            alignItems: 'stretch',
        },
        figure: {
            flex: 1,
        },
        figureDivider: {
            width: 1,
            backgroundColor: colors.border,
            marginHorizontal: spacing.l,
        },
        figureLabel: {
            fontSize: 12,
            color: colors.textMuted,
            marginBottom: spacing.xs,
        },
        figureAmount: {
            fontSize: 22,
            fontWeight: '700',
            color: colors.textPrimary,
            fontVariant: ['tabular-nums'],
        },
        net: {
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: spacing.l,
            paddingTop: spacing.m,
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
        netLabel: {
            flex: 1,
            fontSize: 13,
            color: colors.textSecondary,
        },
        netAmount: {
            fontSize: 15,
            fontWeight: '700',
            color: colors.textPrimary,
            fontVariant: ['tabular-nums'],
        },
        settled: {
            flexDirection: 'row',
            alignItems: 'flex-start',
        },
        settledIcon: {
            marginRight: spacing.m,
            marginTop: 1,
        },
        settledText: {
            flex: 1,
        },
        settledTitle: {
            fontSize: 15,
            fontWeight: '700',
            color: colors.textPrimary,
            marginBottom: 2,
        },
        settledMessage: {
            ...typography.caption,
        },
        pairs: {
            paddingHorizontal: spacing.l,
        },
        pairRow: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 56,
            paddingVertical: spacing.m,
        },
        pairDivider: {
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        pairIcon: {
            width: 28,
            alignItems: 'flex-start',
        },
        pairSentence: {
            flex: 1,
            fontSize: 14,
            color: colors.textPrimary,
        },
        pairAmount: {
            marginLeft: spacing.m,
            fontSize: 15,
            fontWeight: '700',
            color: colors.textPrimary,
            fontVariant: ['tabular-nums'],
        },
        skeletonRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: spacing.m,
        },
    });

export default GroupBalances;
