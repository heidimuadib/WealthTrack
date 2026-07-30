import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { CalendarClock } from 'lucide-react-native';

import Input from '../components/Input';
import Button from '../components/Button';
import Card from '../components/Card';
import ProgressBar from '../components/ProgressBar';
import MonthSelector from '../components/MonthSelector';
import ScreenHeader from '../components/ScreenHeader';
import ErrorState from '../components/ErrorState';
import ErrorBanner from '../components/ErrorBanner';
import { useFeedback } from '../components/FeedbackProvider';
import { errorMessage } from '../utils/error';
import {
    balanceGradient,
    dangerGradient,
    colors,
    gradientAngles,
    radius,
    shadows,
    spacing,
    typography,
} from '../theme';
import { useExpenses } from '../hooks/useExpenses';
import { useBudget, useSetBudget } from '../hooks/useBudget';
import { useRefreshOnFocus } from '../hooks/useRefreshOnFocus';
import { currentMonthYear, formatCurrency, formatCompact } from '../utils/format';

const BudgetScreen = () => {
    const [period, setPeriod] = useState(currentMonthYear);
    const [draft, setDraft] = useState('');

    const { alert, notify } = useFeedback();

    const budgetQuery = useBudget(period);
    const expenseQuery = useExpenses(period);
    const setBudgetMutation = useSetBudget();

    useRefreshOnFocus(budgetQuery);
    useRefreshOnFocus(expenseQuery);

    const budget = budgetQuery.data ?? 0;
    const spent = useMemo(
        () => (expenseQuery.data ?? []).reduce((sum, item) => sum + item.amount, 0),
        [expenseQuery.data]
    );

    // This screen used to render straight away with budget and spent both at
    // zero, so a failed load was indistinguishable from a month with no budget
    // set — it confidently showed "₱0 remaining".
    const error = budgetQuery.error || expenseQuery.error;
    const fetching = budgetQuery.isPending || expenseQuery.isPending;
    const hasData = budgetQuery.data !== undefined && expenseQuery.data !== undefined;
    const refreshing = budgetQuery.isRefetching || expenseQuery.isRefetching;
    const loading = setBudgetMutation.isPending;

    const retry = useCallback(() => {
        budgetQuery.refetch();
        expenseQuery.refetch();
    }, [budgetQuery, expenseQuery]);

    // Seeds the input from the stored budget once per month. Keyed on the
    // month rather than the value so a background refetch cannot overwrite an
    // amount the user is midway through typing.
    const seededFor = useRef(null);
    useEffect(() => {
        const stamp = `${period.year}-${period.month}`;
        if (budgetQuery.data !== undefined && seededFor.current !== stamp) {
            seededFor.current = stamp;
            setDraft(budgetQuery.data ? String(budgetQuery.data) : '');
        }
    }, [budgetQuery.data, period]);

    const handleSave = async () => {
        const parsed = parseFloat(draft);

        if (!Number.isFinite(parsed) || parsed < 0) {
            alert({
                title: 'Invalid amount',
                message: 'Enter a number of zero or more.',
            });
            return;
        }

        try {
            await setBudgetMutation.mutateAsync({
                amount: parsed,
                month: period.month,
                year: period.year,
            });
            // A snackbar rather than a dialog — success shouldn't need a tap.
            notify({ message: `Budget set to ${formatCurrency(parsed)}` });
        } catch (err) {
            // The API returns a message naming the offending field, which is
            // more use than a blanket "please try again".
            alert({ title: 'Could not save', message: errorMessage(err) });
        }
    };

    const remaining = budget - spent;
    const isOver = remaining < 0;
    const progress = budget > 0 ? spent / budget : 0;

    // Only meaningful for the month currently in progress.
    const dailyAllowance = useMemo(() => {
        const now = currentMonthYear();
        const isCurrentMonth = period.month === now.month && period.year === now.year;

        if (!isCurrentMonth || budget <= 0 || isOver) {
            return null;
        }

        const today = new Date();
        const daysInMonth = new Date(period.year, period.month, 0).getDate();
        const daysLeft = daysInMonth - today.getDate() + 1;

        return { perDay: remaining / daysLeft, daysLeft };
    }, [period, budget, remaining, isOver]);

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScreenHeader title="Budget" subtitle="Monthly limit" />

            {fetching && !hasData ? (
                <ActivityIndicator color={colors.brand} style={styles.loading} />
            ) : error && !hasData ? (
                <View style={styles.errorScreen}>
                    <ErrorState error={error} onRetry={retry} />
                </View>
            ) : (
            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={retry}
                        tintColor={colors.brand}
                        colors={[colors.brand]}
                    />
                }
            >
                <MonthSelector value={period} onChange={setPeriod} />

                {error ? (
                    <ErrorBanner error={error} onRetry={retry} style={styles.banner} />
                ) : null}

                <LinearGradient
                    colors={isOver ? dangerGradient : balanceGradient}
                    {...gradientAngles.diagonal}
                    style={styles.statusCard}
                >
                    <Text style={styles.statusLabel}>
                        {isOver ? 'Over budget' : 'Remaining'}
                    </Text>
                    <Text style={styles.statusAmount}>
                        {formatCurrency(Math.abs(remaining))}
                    </Text>

                    <View style={styles.progress}>
                        <ProgressBar
                            progress={progress}
                            color={isOver ? '#F2B8B5' : colors.onBrand}
                            trackColor="rgba(255,255,255,0.22)"
                            height={6}
                        />
                    </View>

                    <Text style={styles.statusMeta}>
                        {formatCurrency(spent)} spent
                        {budget > 0 ? ` of ${formatCompact(budget)}` : ' — no budget set'}
                    </Text>
                </LinearGradient>

                {dailyAllowance ? (
                    <View style={styles.insight}>
                        <CalendarClock color={colors.brand} size={16} />
                        <Text style={styles.insightText}>
                            You can spend{' '}
                            <Text style={styles.insightStrong}>
                                {formatCurrency(dailyAllowance.perDay)}
                            </Text>{' '}
                            a day for the next {dailyAllowance.daysLeft}{' '}
                            {dailyAllowance.daysLeft === 1 ? 'day' : 'days'}.
                        </Text>
                    </View>
                ) : null}

                <Text style={styles.sectionTitle}>Set the limit</Text>
                <Card>
                    <Input
                        label="Monthly budget"
                        value={draft}
                        onChangeText={setDraft}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        prefix="₱"
                    />
                    <Button title="Save budget" onPress={handleSave} loading={loading} />
                    <Text style={styles.help}>
                        Budgets are stored per month, so changing this only affects the month
                        shown above.
                    </Text>
                </Card>
            </ScrollView>
            )}
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.canvas,
    },
    content: {
        padding: spacing.l,
        paddingBottom: spacing.xxxl,
    },
    loading: {
        marginTop: spacing.xxl,
    },
    errorScreen: {
        flex: 1,
        justifyContent: 'center',
    },
    banner: {
        marginTop: spacing.l,
    },
    statusCard: {
        borderRadius: radius.xl,
        padding: spacing.xl,
        marginTop: spacing.l,
        marginBottom: spacing.l,
        ...shadows.raised,
    },
    statusLabel: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        color: colors.textOnBrandMuted,
        marginBottom: spacing.s,
    },
    statusAmount: {
        fontSize: 40,
        fontWeight: '700',
        letterSpacing: -1,
        color: colors.onBrand,
        fontVariant: ['tabular-nums'],
    },
    progress: {
        marginTop: spacing.l,
        marginBottom: spacing.s,
    },
    statusMeta: {
        fontSize: 13,
        color: colors.textOnBrandMuted,
    },
    insight: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: colors.brandTint,
        borderRadius: radius.m,
        padding: spacing.l,
        marginBottom: spacing.l,
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
    sectionTitle: {
        ...typography.h2,
        marginBottom: spacing.m,
    },
    help: {
        ...typography.caption,
        marginTop: spacing.l,
        fontSize: 12,
        lineHeight: 17,
    },
});

export default BudgetScreen;
