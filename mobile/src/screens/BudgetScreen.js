import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import { CalendarClock } from 'lucide-react-native';

import Input from '../components/Input';
import Button from '../components/Button';
import Card from '../components/Card';
import ProgressBar from '../components/ProgressBar';
import MonthSelector from '../components/MonthSelector';
import ScreenHeader from '../components/ScreenHeader';
import { useFeedback } from '../components/FeedbackProvider';
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
import { budgetService, expenseService } from '../services/api';
import { currentMonthYear, formatCurrency, formatCompact } from '../utils/format';

const BudgetScreen = () => {
    const [period, setPeriod] = useState(currentMonthYear);
    const [budget, setBudget] = useState(0);
    const [spent, setSpent] = useState(0);
    const [draft, setDraft] = useState('');
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const isFocused = useIsFocused();
    const { alert, notify } = useFeedback();

    const fetchData = useCallback(async () => {
        try {
            const [budgetRes, expenseRes] = await Promise.all([
                budgetService.get(period.month, period.year),
                expenseService.getAll(period),
            ]);

            const amount = budgetRes.data?.amount || 0;
            setBudget(amount);
            setDraft(amount ? String(amount) : '');
            setSpent(expenseRes.data.reduce((sum, item) => sum + item.amount, 0));
        } catch (error) {
            console.warn('Failed to load budget', error?.message);
        } finally {
            setRefreshing(false);
        }
    }, [period]);

    useEffect(() => {
        if (isFocused) {
            fetchData();
        }
    }, [isFocused, fetchData]);

    const handleSave = async () => {
        const parsed = parseFloat(draft);

        if (!Number.isFinite(parsed) || parsed < 0) {
            alert({
                title: 'Invalid amount',
                message: 'Enter a number of zero or more.',
            });
            return;
        }

        setLoading(true);
        try {
            await budgetService.set({
                amount: parsed,
                month: period.month,
                year: period.year,
            });
            setBudget(parsed);
            // A snackbar rather than a dialog — success shouldn't need a tap.
            notify({ message: `Budget set to ${formatCurrency(parsed)}` });
        } catch (error) {
            alert({ title: 'Could not save', message: 'Please try again.' });
        } finally {
            setLoading(false);
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

            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => {
                            setRefreshing(true);
                            fetchData();
                        }}
                        tintColor={colors.brand}
                        colors={[colors.brand]}
                    />
                }
            >
                <MonthSelector value={period} onChange={setPeriod} />

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
