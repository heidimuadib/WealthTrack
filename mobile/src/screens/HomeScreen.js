import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { PieChart, Receipt, TrendingUp, Search } from 'lucide-react-native';

import Avatar from '../components/Avatar';
import Card from '../components/Card';
import DonutChart from '../components/DonutChart';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import ErrorBanner from '../components/ErrorBanner';
import MonthSelector from '../components/MonthSelector';
import SpendSummaryCard from '../components/SpendSummaryCard';
import BudgetPromptCard from '../components/BudgetPromptCard';
import GroupsCard from '../components/GroupsCard';
import { DashboardSkeleton } from '../components/ScreenSkeletons';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { useExpenses } from '../hooks/useExpenses';
import { isSharedMirror, expenseRoute } from '../utils/sharedExpense';
import { useBudget } from '../hooks/useBudget';
import { useRefreshOnFocus } from '../hooks/useRefreshOnFocus';
import useAuthStore from '../store/authStore';
import { resolveViewState, LOADING, ERROR } from '../utils/viewState';
import {
    shouldShowBudgetPrompt,
    readDismissedMonths,
    rememberDismissal,
    monthKey,
} from '../utils/budgetPrompt';
import {
    currentMonthYear,
    formatCurrency,
    formatDayLabel,
    shiftMonth,
} from '../utils/format';

// A stable reference for the not-yet-loaded case. A fresh [] on every render
// would change the identity the memos below depend on, so they would recompute
// every time regardless.
const NO_EXPENSES = [];

const HomeScreen = ({ navigation }) => {
    const theme = useTheme();
    const { colors, typography, categoryPalette } = theme;
    const { t } = useLanguage();
    const styles = useMemo(() => createStyles(theme), [theme]);

    const [period, setPeriod] = useState(currentMonthYear);

    const user = useAuthStore((state) => state.user);

    // Each month is its own cache entry, so switching months can never show
    // one month's figures under another's heading — the previous month's data
    // simply is not part of this query.
    const expenseQuery = useExpenses(period);
    const budgetQuery = useBudget(period);

    // Last month, purely so the headline figure can say whether this month is
    // running hotter or cooler. It is deliberately kept out of `loading` and
    // `error` below: the dashboard is about this month, and a missing
    // comparison should cost a line of text, not the whole screen.
    const previousPeriod = useMemo(() => shiftMonth(period, -1), [period]);
    const previousQuery = useExpenses(previousPeriod);

    useRefreshOnFocus(expenseQuery);
    useRefreshOnFocus(budgetQuery);

    const expenses = expenseQuery.data ?? NO_EXPENSES;
    const budget = budgetQuery.data ?? 0;

    // A 401 clears the session and navigates away on its own, and the query
    // client is told not to retry it, so it never surfaces here.
    const error = expenseQuery.error || budgetQuery.error;
    const hasData = expenseQuery.data !== undefined && budgetQuery.data !== undefined;
    const refreshing = expenseQuery.isRefetching || budgetQuery.isRefetching;
    // Pending means nothing is cached yet. A refetch over existing data is not
    // pending, which is what keeps the skeleton from flashing on every tab
    // switch and on every pull-to-refresh.
    const state = resolveViewState({
        isPending: expenseQuery.isPending || budgetQuery.isPending,
        hasData,
        error,
    });

    // null until the stored preference has been read. Rendering the prompt
    // before then would show it for a moment to someone who dismissed it days
    // ago, which is worse than showing it a beat late.
    const [dismissedMonths, setDismissedMonths] = useState(null);

    useEffect(() => {
        let alive = true;
        readDismissedMonths().then((months) => {
            if (alive) {
                setDismissedMonths(months);
            }
        });
        return () => {
            alive = false;
        };
    }, []);

    const showBudgetPrompt =
        dismissedMonths !== null &&
        shouldShowBudgetPrompt({ state, budget, period, dismissedMonths });

    const dismissBudgetPrompt = useCallback(() => {
        // Applied locally first so the card closes on the tap rather than on
        // the write, and remembered afterwards.
        setDismissedMonths((current) => [...(current ?? []), monthKey(period)]);
        rememberDismissal(period);
    }, [period]);

    const retry = useCallback(() => {
        expenseQuery.refetch();
        budgetQuery.refetch();
    }, [expenseQuery, budgetQuery]);

    const onRefresh = retry;

    const totalSpent = useMemo(
        () => expenses.reduce((sum, item) => sum + item.amount, 0),
        [expenses]
    );

    // null rather than 0 while it is still loading — "nothing logged last
    // month" and "we do not know yet" are different statements.
    const previousTotal = useMemo(
        () =>
            previousQuery.data === undefined
                ? null
                : previousQuery.data.reduce((sum, item) => sum + item.amount, 0),
        [previousQuery.data]
    );

    // Real category totals, replacing the hardcoded Food/Transport/Bills
    // numbers the dashboard used to display.
    const breakdown = useMemo(() => {
        const groups = new Map();

        expenses.forEach((expense) => {
            const category = expense.category;
            const key = category?.id ?? 'uncategorised';

            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    label: category?.name || 'Uncategorised',
                    color: category?.color || null,
                    value: 0,
                });
            }
            groups.get(key).value += expense.amount;
        });

        return Array.from(groups.values())
            .sort((a, b) => b.value - a.value)
            .map((item, index) => ({
                ...item,
                color: item.color || categoryPalette[index % categoryPalette.length],
                share: totalSpent > 0 ? item.value / totalSpent : 0,
            }));
    }, [expenses, totalSpent, categoryPalette]);

    // Outside the ScrollView on purpose: the greeting and avatar are identity,
    // not content, so they hold still while figures move. They come from the
    // session rather than a fetch, which is why they are also on screen
    // underneath the skeleton instead of arriving with the data.
    const header = (
        <View style={styles.header}>
            <View style={styles.headerText}>
                <Text style={styles.greeting}>
                    {t('home.greeting')}{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
                </Text>
                <Text style={typography.caption}>{t('home.tagline')}</Text>
            </View>

            {/* Beside the avatar rather than over the greeting: the header
                is the one place present on every visit, and a search icon
                there is found without being looked for. */}
            <TouchableOpacity
                onPress={() => navigation.navigate('Search')}
                activeOpacity={0.75}
                style={styles.searchButton}
                accessibilityRole="button"
                accessibilityLabel={t('search.open')}
            >
                <Search color={colors.textSecondary} size={20} />
            </TouchableOpacity>

            <TouchableOpacity
                onPress={() => navigation.navigate('Settings')}
                activeOpacity={0.75}
                style={styles.avatar}
                accessibilityLabel={t('home.openProfile')}
            >
                <Avatar user={user} size={44} />
            </TouchableOpacity>
        </View>
    );

    if (state === LOADING) {
        return (
            <View style={styles.container}>
                {header}
                <DashboardSkeleton />
            </View>
        );
    }

    // Nothing ever loaded, so there are no figures to fall through to. The
    // empty state would claim ₱0 spent, which is a different — and wrong —
    // statement about the month.
    if (state === ERROR) {
        return (
            <View style={styles.errorScreen}>
                <ErrorState error={error} onRetry={retry} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {header}

        <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={colors.brand}
                    colors={[colors.brand]}
                />
            }
        >
            <View style={styles.monthRow}>
                <MonthSelector value={period} onChange={setPeriod} />
            </View>

            {/* Figures below are from the last successful load. */}
            {error ? (
                <ErrorBanner error={error} onRetry={retry} style={styles.banner} />
            ) : null}

            {/* The single gradient in the app, reserved for the headline figure. */}
            <SpendSummaryCard
                period={period}
                total={totalSpent}
                budget={budget}
                previousTotal={previousTotal}
                onPressBudget={() => navigation.navigate('Budget')}
            />

            {/* Directly under the figure it would give meaning to. The card
                above already offers "set a budget"; this says what one is
                actually for, which is the part that makes it worth doing. */}
            {showBudgetPrompt ? (
                <BudgetPromptCard
                    onSetBudget={() => navigation.navigate('Budget')}
                    onDismiss={dismissBudgetPrompt}
                    style={styles.prompt}
                />
            ) : null}

            {/* Below the month's own figures, above the breakdown: a way into
                something adjacent to this screen's subject rather than part
                of it. One request, and no balance it would have to invent. */}
            <GroupsCard
                onPress={() => navigation.navigate('Groups')}
                onCreate={() => navigation.navigate('CreateGroup')}
                style={styles.groupsCard}
            />

            <Text style={styles.sectionTitle}>{t('home.breakdown')}</Text>
            <Card>
                {breakdown.length === 0 ? (
                    <EmptyState
                        icon={PieChart}
                        title={t('home.emptyBreakdownTitle')}
                        message={t('home.emptyBreakdownMsg')}
                        actionLabel={t('home.addExpense')}
                        onAction={() => navigation.navigate('Add')}
                    />
                ) : (
                    <>
                        <View style={styles.chartWrap}>
                            <DonutChart data={breakdown} caption={t('home.spentCaption')} />
                        </View>

                        <View style={styles.legend}>
                            {breakdown.map((item) => (
                                <View key={item.key} style={styles.legendRow}>
                                    <View style={[styles.dot, { backgroundColor: item.color }]} />
                                    <Text style={styles.legendLabel} numberOfLines={1}>
                                        {item.label}
                                    </Text>
                                    <Text style={styles.legendShare}>
                                        {Math.round(item.share * 100)}%
                                    </Text>
                                    <Text style={styles.legendValue}>
                                        {formatCurrency(item.value)}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}
            </Card>

            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('home.recent')}</Text>
                {expenses.length > 0 ? (
                    <TouchableOpacity onPress={() => navigation.navigate('Expenses')}>
                        <Text style={styles.seeAll}>{t('home.seeAll')}</Text>
                    </TouchableOpacity>
                ) : null}
            </View>

            {expenses.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={Receipt}
                        title={t('home.emptyMonthTitle')}
                        message={t('home.emptyMonthMsg')}
                        actionLabel={t('home.addFirst')}
                        onAction={() => navigation.navigate('Add')}
                    />
                </Card>
            ) : (
                <Card padded={false}>
                    {expenses.slice(0, 5).map((expense, index) => (
                        <TouchableOpacity
                            key={expense.id}
                            style={[styles.row, index > 0 && styles.rowDivider]}
                            onPress={() => navigation.navigate(...expenseRoute(expense))}
                            accessibilityHint={
                                isSharedMirror(expense) ? t('expenses.sharedA11y') : undefined
                            }
                            activeOpacity={0.7}
                        >
                            <View
                                style={[
                                    styles.rowDot,
                                    { backgroundColor: expense.category?.color || colors.textMuted },
                                ]}
                            />
                            <View style={styles.rowMain}>
                                <Text style={styles.rowTitle} numberOfLines={1}>
                                    {expense.notes || expense.category?.name || t('home.expenseFallback')}
                                </Text>
                                <Text style={styles.rowMeta}>
                                    {expense.category?.name} · {formatDayLabel(expense.date)}
                                </Text>
                            </View>
                            <Text style={styles.rowAmount}>
                                −{formatCurrency(expense.amount)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </Card>
            )}

            {breakdown.length > 0 ? (
                <View style={styles.insight}>
                    <TrendingUp color={colors.brand} size={16} />
                    <Text style={styles.insightText}>
                        {t('home.insight', {
                            category: breakdown[0].label,
                            percent: Math.round(breakdown[0].share * 100),
                        })}
                    </Text>
                </View>
            ) : null}
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
    scroll: {
        flex: 1,
    },
    errorScreen: {
        flex: 1,
        backgroundColor: colors.canvas,
        justifyContent: 'center',
    },
    banner: {
        marginBottom: spacing.l,
    },
    content: {
        padding: spacing.l,
        paddingTop: spacing.xs,
        paddingBottom: spacing.xxxl,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.l,
        // The status bar already reserves its own space above the window, so
        // anything more than a breath here reads as a hole in the layout.
        paddingTop: spacing.m,
        paddingBottom: spacing.m,
    },
    headerText: {
        flex: 1,
    },
    greeting: {
        ...typography.h1,
        marginBottom: 2,
    },
    avatar: {
        marginLeft: spacing.m,
    },
    monthRow: {
        marginBottom: spacing.l,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    searchButton: {
        // 44pt square, so the icon inside it can stay small and quiet.
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.xs,
    },
    prompt: {
        marginTop: spacing.l,
        marginBottom: 0,
    },
    groupsCard: {
        marginTop: spacing.l,
    },
    sectionTitle: {
        ...typography.h2,
        marginBottom: spacing.m,
        marginTop: spacing.s,
    },
    seeAll: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.brand,
    },
    chartWrap: {
        alignItems: 'center',
        paddingVertical: spacing.s,
    },
    legend: {
        marginTop: spacing.l,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: spacing.m,
    },
    legendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.s,
    },
    dot: {
        width: 9,
        height: 9,
        borderRadius: radius.round,
        marginRight: spacing.m,
    },
    legendLabel: {
        flex: 1,
        fontSize: 14,
        color: colors.textPrimary,
    },
    legendShare: {
        fontSize: 12,
        color: colors.textMuted,
        width: 42,
        textAlign: 'right',
        fontVariant: ['tabular-nums'],
    },
    legendValue: {
        ...typography.amount,
        width: 96,
        textAlign: 'right',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.l,
        paddingHorizontal: spacing.l,
    },
    rowDivider: {
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    rowDot: {
        width: 9,
        height: 9,
        borderRadius: radius.round,
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
    rowAmount: {
        ...typography.amount,
        marginLeft: spacing.m,
    },
    insight: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: colors.brandTint,
        borderRadius: radius.m,
        padding: spacing.l,
        marginTop: spacing.xl,
    },
    insightText: {
        flex: 1,
        marginLeft: spacing.m,
        fontSize: 13,
        lineHeight: 19,
        color: colors.textSecondary,
    },
    insightStrong: {
        fontWeight: '700',
        color: colors.brand,
    },
    });

export default HomeScreen;
