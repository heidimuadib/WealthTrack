import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    SectionList,
    RefreshControl,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Receipt, Search, X } from 'lucide-react-native';

import Input from '../components/Input';
import MonthSelector from '../components/MonthSelector';
import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';
import { useFeedback } from '../components/FeedbackProvider';
import { colors, radius, spacing, typography } from '../theme';
import { expenseService } from '../services/api';
import { currentMonthYear, formatCurrency, formatDayLabel } from '../utils/format';

const ExpensesScreen = ({ navigation }) => {
    const [period, setPeriod] = useState(currentMonthYear);
    const [expenses, setExpenses] = useState([]);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const isFocused = useIsFocused();
    const { confirm, notify } = useFeedback();

    const fetchExpenses = useCallback(async () => {
        try {
            const res = await expenseService.getAll(period);
            setExpenses(res.data);
        } catch (error) {
            console.warn('Failed to load expenses', error?.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [period]);

    useEffect(() => {
        if (isFocused) {
            fetchExpenses();
        }
    }, [isFocused, fetchExpenses]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchExpenses();
    };

    // Newest-first, matching the order the API returns.
    const restore = (expense) =>
        setExpenses((prev) =>
            [...prev, expense].sort((a, b) => new Date(b.date) - new Date(a.date))
        );

    const handleDelete = async (expense) => {
        const label = expense.notes || expense.category?.name || 'This expense';

        const confirmed = await confirm({
            title: 'Delete this expense?',
            message: `${label} — ${formatCurrency(expense.amount)}`,
            confirmLabel: 'Delete',
            destructive: true,
        });

        if (!confirmed) {
            return;
        }

        // Vanish from the list immediately, but hold the API call back so Undo
        // can cancel it outright. If the app dies first, nothing was deleted.
        setExpenses((prev) => prev.filter((e) => e.id !== expense.id));

        notify({
            message: 'Expense deleted',
            actionLabel: 'UNDO',
            onAction: () => restore(expense),
            onTimeout: async () => {
                try {
                    await expenseService.delete(expense.id);
                } catch (error) {
                    restore(expense);
                }
            },
        });
    };

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) {
            return expenses;
        }
        return expenses.filter((expense) => {
            const haystack = `${expense.notes || ''} ${expense.category?.name || ''}`;
            return haystack.toLowerCase().includes(needle);
        });
    }, [expenses, query]);

    // The API already sorts newest-first, so insertion order gives us
    // correctly ordered day groups for free.
    const sections = useMemo(() => {
        const groups = new Map();

        filtered.forEach((expense) => {
            const key = new Date(expense.date).toDateString();
            if (!groups.has(key)) {
                groups.set(key, { title: formatDayLabel(expense.date), data: [] });
            }
            groups.get(key).data.push(expense);
        });

        // A per-day total in every header answers "how much did I spend that
        // day" for all days at once — no date picker needed.
        return Array.from(groups.values()).map((group) => ({
            ...group,
            total: group.data.reduce((sum, item) => sum + item.amount, 0),
        }));
    }, [filtered]);

    const total = useMemo(
        () => filtered.reduce((sum, item) => sum + item.amount, 0),
        [filtered]
    );

    const renderItem = ({ item }) => (
        <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('EditExpense', { expense: item })}
            onLongPress={() => handleDelete(item)}
            activeOpacity={0.7}
        >
            <View
                style={[
                    styles.dot,
                    { backgroundColor: item.category?.color || colors.textMuted },
                ]}
            />
            <View style={styles.rowMain}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.notes || item.category?.name || 'Expense'}
                </Text>
                <Text style={styles.rowMeta}>{item.category?.name || 'Uncategorised'}</Text>
            </View>
            <Text style={styles.rowAmount}>−{formatCurrency(item.amount)}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <ScreenHeader title="Expenses" subtitle="All transactions" />

            <View style={styles.controls}>
                <MonthSelector value={period} onChange={setPeriod} />

                <Input
                    placeholder="Search notes or category"
                    value={query}
                    onChangeText={setQuery}
                    autoCapitalize="none"
                    style={styles.search}
                    leftIcon={<Search color={colors.textMuted} size={17} />}
                    rightSlot={
                        query ? (
                            <TouchableOpacity onPress={() => setQuery('')} hitSlop={hitSlop}>
                                <X color={colors.textMuted} size={17} />
                            </TouchableOpacity>
                        ) : null
                    }
                />

                {filtered.length > 0 ? (
                    <View style={styles.summary}>
                        <Text style={typography.caption}>
                            {filtered.length} {filtered.length === 1 ? 'expense' : 'expenses'}
                        </Text>
                        <Text style={styles.summaryTotal}>{formatCurrency(total)}</Text>
                    </View>
                ) : null}
            </View>

            {loading ? (
                <ActivityIndicator color={colors.brand} style={styles.loading} />
            ) : (
                <SectionList
                    sections={sections}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={renderItem}
                    renderSectionHeader={({ section }) => (
                        <View style={styles.sectionHeaderRow}>
                            <Text style={styles.sectionHeader}>{section.title}</Text>
                            <Text style={styles.sectionTotal}>
                                {formatCurrency(section.total)}
                            </Text>
                        </View>
                    )}
                    contentContainerStyle={styles.list}
                    stickySectionHeadersEnabled={false}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={colors.brand}
                            colors={[colors.brand]}
                        />
                    }
                    ListEmptyComponent={
                        query ? (
                            <EmptyState
                                icon={Search}
                                title="No matches"
                                message={`Nothing found for “${query}” in this month.`}
                            />
                        ) : (
                            <EmptyState
                                icon={Receipt}
                                title="No expenses this month"
                                message="Tap the + tab to record your first one."
                                actionLabel="Add expense"
                                onAction={() => navigation.navigate('Add')}
                            />
                        )
                    }
                    ListFooterComponent={
                        filtered.length > 0 ? (
                            <Text style={styles.hint}>Tap to edit · Long-press to delete</Text>
                        ) : null
                    }
                />
            )}
        </View>
    );
};

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.canvas,
    },
    controls: {
        paddingHorizontal: spacing.l,
    },
    search: {
        marginTop: spacing.m,
        marginBottom: 0,
    },
    summary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: spacing.l,
    },
    summaryTotal: {
        ...typography.h2,
        fontVariant: ['tabular-nums'],
    },
    loading: {
        marginTop: spacing.xxl,
    },
    list: {
        padding: spacing.l,
        paddingBottom: spacing.xxxl,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginTop: spacing.l,
        marginBottom: spacing.s,
    },
    sectionHeader: {
        ...typography.overline,
    },
    sectionTotal: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.textSecondary,
        fontVariant: ['tabular-nums'],
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.m,
        paddingVertical: spacing.l,
        paddingHorizontal: spacing.l,
        marginBottom: spacing.s,
    },
    dot: {
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
    hint: {
        ...typography.caption,
        textAlign: 'center',
        marginTop: spacing.l,
        fontSize: 12,
    },
});

export default ExpensesScreen;
