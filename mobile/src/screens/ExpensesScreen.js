import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    SectionList,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Receipt, Search, X } from 'lucide-react-native';

import Input from '../components/Input';
import MonthSelector from '../components/MonthSelector';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import ErrorBanner from '../components/ErrorBanner';
import ScreenHeader from '../components/ScreenHeader';
import { ExpenseListSkeleton } from '../components/ScreenSkeletons';
import { useFeedback } from '../components/FeedbackProvider';
import { resolveViewState, LOADING, ERROR } from '../utils/viewState';
import { errorMessage } from '../utils/error';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { useExpenses, useDeleteExpense } from '../hooks/useExpenses';
import { useRefreshOnFocus } from '../hooks/useRefreshOnFocus';
import { queryKeys } from '../lib/queryKeys';
import { currentMonthYear, formatCurrency, formatDayLabel } from '../utils/format';

// Stable reference for the not-yet-loaded case, so the memos below are not
// invalidated by a fresh [] on every render.
const NO_EXPENSES = [];

const ExpensesScreen = ({ navigation }) => {
    const theme = useTheme();
    const { colors, typography } = theme;
    const { t } = useLanguage();
    const styles = useMemo(() => createStyles(theme), [theme]);

    const [period, setPeriod] = useState(currentMonthYear);
    const [query, setQuery] = useState('');

    const queryClient = useQueryClient();
    const expenseQuery = useExpenses(period);
    const deleteExpense = useDeleteExpense();

    useRefreshOnFocus(expenseQuery);

    const { confirm, notify } = useFeedback();

    const expenses = expenseQuery.data ?? NO_EXPENSES;
    const error = expenseQuery.error;
    const hasData = expenseQuery.data !== undefined;
    const refreshing = expenseQuery.isRefetching;
    const state = resolveViewState({
        isPending: expenseQuery.isPending,
        hasData,
        error,
    });

    const retry = useCallback(() => expenseQuery.refetch(), [expenseQuery]);

    // The row has to leave the list before the request is sent, so Undo can
    // cancel it outright. Editing the cache rather than local state keeps the
    // list a single source of truth. Newest-first matches the API's order.
    const monthKey = queryKeys.expenses.month(period);

    const removeFromCache = (id) =>
        queryClient.setQueryData(monthKey, (current = []) =>
            current.filter((e) => e.id !== id)
        );

    const restoreToCache = (expense) =>
        queryClient.setQueryData(monthKey, (current = []) =>
            [...current, expense].sort((a, b) => new Date(b.date) - new Date(a.date))
        );

    const handleDelete = async (expense) => {
        const label = expense.notes || expense.category?.name || t('expenses.thisExpense');

        const confirmed = await confirm({
            title: t('expenses.deleteTitle'),
            message: `${label} — ${formatCurrency(expense.amount)}`,
            confirmLabel: t('expenses.deleteConfirm'),
            destructive: true,
        });

        if (!confirmed) {
            return;
        }

        // Held back until the snackbar expires. If the app dies first, nothing
        // was deleted.
        removeFromCache(expense.id);

        notify({
            message: t('expenses.deleted'),
            actionLabel: t('expenses.undo'),
            onAction: () => restoreToCache(expense),
            onTimeout: async () => {
                try {
                    await deleteExpense.mutateAsync(expense.id);
                } catch (err) {
                    // The row reappearing on its own looks like a bug unless
                    // the reason lands with it.
                    restoreToCache(expense);
                    notify({
                        message: t('expenses.couldntDelete', { reason: errorMessage(err) }),
                    });
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
                    {item.notes || item.category?.name || t('home.expenseFallback')}
                </Text>
                <Text style={styles.rowMeta}>
                    {item.category?.name || t('expenses.uncategorised')}
                </Text>
            </View>
            <Text style={styles.rowAmount}>−{formatCurrency(item.amount)}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <ScreenHeader title={t('expenses.title')} subtitle={t('expenses.subtitle')} />

            <View style={styles.controls}>
                <MonthSelector value={period} onChange={setPeriod} />

                <Input
                    placeholder={t('expenses.search')}
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
                            {t(
                                filtered.length === 1
                                    ? 'expenses.countOne'
                                    : 'expenses.countMany',
                                { count: filtered.length }
                            )}
                        </Text>
                        <Text style={styles.summaryTotal}>{formatCurrency(total)}</Text>
                    </View>
                ) : null}
            </View>

            {state === LOADING ? (
                <ExpenseListSkeleton />
            ) : state === ERROR ? (
                // An empty list here would read as "you spent nothing this
                // month" when the truth is that nothing could be fetched.
                <ErrorState error={error} onRetry={retry} />
            ) : (
                <SectionList
                    sections={sections}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={renderItem}
                    ListHeaderComponent={
                        error ? (
                            <ErrorBanner
                                error={error}
                                onRetry={retry}
                                style={styles.banner}
                            />
                        ) : null
                    }
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
                            onRefresh={retry}
                            tintColor={colors.brand}
                            colors={[colors.brand]}
                        />
                    }
                    ListEmptyComponent={
                        query ? (
                            // Filtered-empty, not empty. There are expenses
                            // here; the search just does not match any. The
                            // useful next step is undoing the search, not
                            // recording something new.
                            <EmptyState
                                icon={Search}
                                title={t('expenses.noMatchesTitle')}
                                message={t('expenses.noMatchesMsg', { query })}
                                actionLabel={t('expenses.clearSearch')}
                                onAction={() => setQuery('')}
                            />
                        ) : (
                            <EmptyState
                                icon={Receipt}
                                title={t('expenses.emptyTitle')}
                                message={t('expenses.emptyMsg')}
                                actionLabel={t('home.addExpense')}
                                onAction={() => navigation.navigate('Add')}
                            />
                        )
                    }
                    ListFooterComponent={
                        filtered.length > 0 ? (
                            <Text style={styles.hint}>{t('expenses.hint')}</Text>
                        ) : null
                    }
                />
            )}
        </View>
    );
};

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
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
    banner: {
        marginBottom: spacing.l,
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
