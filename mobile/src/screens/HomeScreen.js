import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    TouchableOpacity,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { PieChart, Receipt, TrendingUp } from 'lucide-react-native';

import Card from '../components/Card';
import DonutChart from '../components/DonutChart';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import ErrorBanner from '../components/ErrorBanner';
import MonthSelector from '../components/MonthSelector';
import ProgressBar from '../components/ProgressBar';
import { radius, spacing, useTheme } from '../theme';
import { useExpenses } from '../hooks/useExpenses';
import { useBudget } from '../hooks/useBudget';
import { useRefreshOnFocus } from '../hooks/useRefreshOnFocus';
import useAuthStore from '../store/authStore';
import {
    currentMonthYear,
    formatCurrency,
    formatDayLabel,
    formatCompact,
} from '../utils/format';

// A stable reference for the not-yet-loaded case. A fresh [] on every render
// would change the identity the memos below depend on, so they would recompute
// every time regardless.
const NO_EXPENSES = [];

const HomeScreen = ({ navigation }) => {
    const theme = useTheme();
    const { colors, typography, categoryPalette, balanceGradient, gradientAngles } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);

    const [period, setPeriod] = useState(currentMonthYear);

    const user = useAuthStore((state) => state.user);

    // Each month is its own cache entry, so switching months can never show
    // one month's figures under another's heading — the previous month's data
    // simply is not part of this query.
    const expenseQuery = useExpenses(period);
    const budgetQuery = useBudget(period);

    useRefreshOnFocus(expenseQuery);
    useRefreshOnFocus(budgetQuery);

    const expenses = expenseQuery.data ?? NO_EXPENSES;
    const budget = budgetQuery.data ?? 0;

    // A 401 clears the session and navigates away on its own, and the query
    // client is told not to retry it, so it never surfaces here.
    const error = expenseQuery.error || budgetQuery.error;
    // Pending means nothing is cached yet. A refetch over existing data is not
    // pending, which is what removes the spinner flash on every tab switch.
    const loading = expenseQuery.isPending || budgetQuery.isPending;
    const hasData = expenseQuery.data !== undefined && budgetQuery.data !== undefined;
    const refreshing = expenseQuery.isRefetching || budgetQuery.isRefetching;

    const retry = useCallback(() => {
        expenseQuery.refetch();
        budgetQuery.refetch();
    }, [expenseQuery, budgetQuery]);

    const onRefresh = retry;

    const totalSpent = useMemo(
        () => expenses.reduce((sum, item) => sum + item.amount, 0),
        [expenses]
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

    const remaining = budget - totalSpent;
    const isOver = remaining < 0;
    const progress = budget > 0 ? totalSpent / budget : 0;

    if (loading) {
        return (
            <View style={styles.loading}>
                <ActivityIndicator color={colors.brand} size="large" />
            </View>
        );
    }

    // Nothing ever loaded, so there are no figures to fall through to. The
    // empty state would claim ₱0 spent, which is a different — and wrong —
    // statement about the month.
    if (error && !hasData) {
        return (
            <View style={styles.errorScreen}>
                <ErrorState error={error} onRetry={retry} />
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
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
            <View style={styles.header}>
                <View style={styles.headerText}>
                    <Text style={styles.greeting}>
                        Kumusta{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
                    </Text>
                    <Text style={typography.caption}>Here’s where your money went.</Text>
                </View>

                <TouchableOpacity
                    onPress={() => navigation.navigate('Settings')}
                    activeOpacity={0.75}
                    style={styles.avatar}
                    accessibilityLabel="Open your profile"
                >
                    <Text style={styles.avatarText}>
                        {user?.name?.trim()?.charAt(0)?.toUpperCase() || 'U'}
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={styles.monthRow}>
                <MonthSelector value={period} onChange={setPeriod} />
            </View>

            {/* Figures below are from the last successful load. */}
            {error ? (
                <ErrorBanner error={error} onRetry={retry} style={styles.banner} />
            ) : null}

            {/* The single gradient in the app, reserved for the headline figure. */}
            <LinearGradient
                colors={balanceGradient}
                {...gradientAngles.diagonal}
                style={styles.balanceCard}
            >
                <Text style={styles.balanceLabel}>Spent this month</Text>
                <Text style={styles.balanceAmount}>{formatCurrency(totalSpent)}</Text>

                {budget > 0 ? (
                    <>
                        <View style={styles.balanceProgress}>
                            <ProgressBar
                                progress={progress}
                                color={isOver ? '#F2B8B5' : colors.onBrand}
                                trackColor="rgba(255,255,255,0.22)"
                                height={6}
                            />
                        </View>
                        <Text style={styles.balanceMeta}>
                            {isOver
                                ? `${formatCurrency(Math.abs(remaining))} over your ${formatCompact(budget)} budget`
                                : `${formatCurrency(remaining)} left of ${formatCompact(budget)}`}
                        </Text>
                    </>
                ) : (
                    <TouchableOpacity onPress={() => navigation.navigate('Budget')}>
                        <Text style={styles.balanceMetaLink}>
                            No budget set for this month — tap to add one
                        </Text>
                    </TouchableOpacity>
                )}
            </LinearGradient>

            <Text style={styles.sectionTitle}>Spending breakdown</Text>
            <Card>
                {breakdown.length === 0 ? (
                    <EmptyState
                        icon={PieChart}
                        title="Nothing to break down yet"
                        message="Add an expense and your category split will appear here."
                        actionLabel="Add expense"
                        onAction={() => navigation.navigate('Add')}
                    />
                ) : (
                    <>
                        <View style={styles.chartWrap}>
                            <DonutChart data={breakdown} caption="Spent" />
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
                <Text style={styles.sectionTitle}>Recent</Text>
                {expenses.length > 0 ? (
                    <TouchableOpacity onPress={() => navigation.navigate('Expenses')}>
                        <Text style={styles.seeAll}>See all</Text>
                    </TouchableOpacity>
                ) : null}
            </View>

            {expenses.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={Receipt}
                        title="No expenses this month"
                        message="Once you log something, it will show up right here."
                        actionLabel="Add your first expense"
                        onAction={() => navigation.navigate('Add')}
                    />
                </Card>
            ) : (
                <Card padded={false}>
                    {expenses.slice(0, 5).map((expense, index) => (
                        <TouchableOpacity
                            key={expense.id}
                            style={[styles.row, index > 0 && styles.rowDivider]}
                            onPress={() => navigation.navigate('EditExpense', { expense })}
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
                                    {expense.notes || expense.category?.name || 'Expense'}
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
                        <Text style={styles.insightStrong}>{breakdown[0].label}</Text> is your
                        biggest category at {Math.round(breakdown[0].share * 100)}% of spending.
                    </Text>
                </View>
            ) : null}
        </ScrollView>
    );
};

const createStyles = ({ colors, typography, shadows }) =>
    StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.canvas,
    },
    loading: {
        flex: 1,
        backgroundColor: colors.canvas,
        alignItems: 'center',
        justifyContent: 'center',
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
        paddingTop: spacing.xxl,
        paddingBottom: spacing.xxxl,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.l,
    },
    headerText: {
        flex: 1,
    },
    greeting: {
        ...typography.h1,
        marginBottom: 2,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: radius.round,
        backgroundColor: colors.brand,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: spacing.m,
    },
    avatarText: {
        color: colors.onBrand,
        fontSize: 17,
        fontWeight: '700',
    },
    monthRow: {
        marginBottom: spacing.l,
    },
    balanceCard: {
        borderRadius: radius.xl,
        padding: spacing.xl,
        marginBottom: spacing.xl,
        ...shadows.raised,
    },
    balanceLabel: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        color: colors.textOnBrandMuted,
        marginBottom: spacing.s,
    },
    balanceAmount: {
        fontSize: 38,
        fontWeight: '700',
        letterSpacing: -1,
        color: colors.onBrand,
        fontVariant: ['tabular-nums'],
    },
    balanceProgress: {
        marginTop: spacing.l,
        marginBottom: spacing.s,
    },
    balanceMeta: {
        fontSize: 13,
        color: colors.textOnBrandMuted,
    },
    balanceMetaLink: {
        fontSize: 13,
        color: colors.onBrand,
        marginTop: spacing.l,
        textDecorationLine: 'underline',
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
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
