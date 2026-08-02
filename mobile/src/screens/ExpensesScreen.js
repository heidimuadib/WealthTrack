import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    SectionList,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Receipt, Search, SlidersHorizontal, X } from 'lucide-react-native';

import Input from '../components/Input';
import MonthSelector from '../components/MonthSelector';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import ErrorBanner from '../components/ErrorBanner';
import ScreenHeader from '../components/ScreenHeader';
import { ExpenseListSkeleton } from '../components/ScreenSkeletons';
import SwipeableRow from '../components/SwipeableRow';
import CategoryFilter from '../components/CategoryFilter';
import { useFeedback } from '../components/FeedbackProvider';
import { resolveViewState, LOADING, ERROR } from '../utils/viewState';
import {
    ALL_CATEGORIES,
    filterExpenses,
    emptyKind,
    resolveSelectedCategory,
    EMPTY_MONTH,
    EMPTY_SEARCH,
    EMPTY_CATEGORY,
} from '../utils/expenseFilters';
import { errorMessage } from '../utils/error';
import haptics from '../services/haptics';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { useExpenses, useDeleteExpense } from '../hooks/useExpenses';
import { useCategories } from '../hooks/useCategories';
import { useRefreshOnFocus } from '../hooks/useRefreshOnFocus';
import { queryKeys } from '../lib/queryKeys';
import { currentMonthYear, formatCurrency, formatDayLabel } from '../utils/format';

// Stable reference for the not-yet-loaded case, so the memos below are not
// invalidated by a fresh [] on every render.
const NO_EXPENSES = [];
const NO_CATEGORIES = [];

const ExpensesScreen = ({ navigation }) => {
    const theme = useTheme();
    const { colors, typography } = theme;
    const { t } = useLanguage();
    const styles = useMemo(() => createStyles(theme), [theme]);

    const [period, setPeriod] = useState(currentMonthYear);
    const [query, setQuery] = useState('');
    // Not persisted across launches. A filter the user cannot see the reason
    // for is worse than one they have to set again — opening the app to a list
    // that is quietly hiding most of last week is a bug report, not a feature.
    const [categoryId, setCategoryId] = useState(ALL_CATEGORIES);

    // Only ever holds the one row that is open, so opening a second closes the
    // first rather than leaving a trail of half-swiped rows behind.
    const openRow = useRef(null);
    // id -> swipeable handle, so a row can be closed without re-rendering the
    // list to reach it.
    const rowRefs = useRef(new Map());
    // Ids whose deletion is already scheduled. Two taps landing in the same
    // batch would otherwise schedule the commit twice.
    const scheduled = useRef(new Set());

    const queryClient = useQueryClient();
    const expenseQuery = useExpenses(period);
    // Already cached for the add screen, so this costs nothing new. Its failure
    // is deliberately not folded into the screen's state: the filter row is a
    // convenience, and losing it must not take the expense list with it.
    const categoryQuery = useCategories();
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

    // Named for the rotor, so the action reads as "Delete expense" rather
    // than as an unlabelled custom action.
    const ROW_ACTIONS = useMemo(
        () => [{ name: 'delete', label: t('expenses.deleteAction') }],
        [t]
    );

    const closeOpenRow = useCallback(() => {
        openRow.current?.close?.();
        openRow.current = null;
    }, []);

    // A category can be deleted from the Categories screen while it is
    // selected here, which would otherwise leave this list permanently empty
    // with no obvious reason why.
    const categories = categoryQuery.data;

    useEffect(() => {
        setCategoryId((current) => resolveSelectedCategory(current, categories));
    }, [categories]);

    // The delete itself, once something has decided it should happen. Reached
    // two ways: tapping the revealed swipe action, which is already two
    // deliberate movements, and the confirmation dialog behind long-press and
    // the screen-reader action, which are one.
    const performDelete = useCallback((expense) => {
        // Two taps in one batch would schedule two commits for the same row.
        if (scheduled.current.has(expense.id)) {
            return;
        }
        scheduled.current.add(expense.id);

        closeOpenRow();

        // Light, not success. Nothing has been sent yet — this only takes the
        // row off the screen, and the request is still five seconds away. The
        // commit itself gets no haptic either: by then the snackbar has gone
        // and the user has moved on, so a buzz would be about something they
        // can no longer see.
        haptics.light();

        // Held back until the snackbar expires. If the app dies first, nothing
        // was deleted.
        removeFromCache(expense.id);

        notify({
            message: t('expenses.deleted'),
            actionLabel: t('expenses.undo'),
            onAction: () => {
                haptics.light();
                // Undone, so it may be deleted again later.
                scheduled.current.delete(expense.id);
                restoreToCache(expense);
            },
            onTimeout: async () => {
                try {
                    await deleteExpense.mutateAsync(expense.id);
                } catch (err) {
                    // The row reappearing on its own looks like a bug unless
                    // the reason lands with it — and this one does buzz,
                    // because it puts a row back on screen and raises a
                    // second snackbar the user needs to notice.
                    haptics.error();
                    restoreToCache(expense);
                    notify({
                        message: t('expenses.couldntDelete', { reason: errorMessage(err) }),
                    });
                } finally {
                    // Committed or restored, the row is no longer pending.
                    scheduled.current.delete(expense.id);
                }
            },
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [notify, deleteExpense, t, monthKey]);

    // Long-press and the screen-reader action are single movements, so they
    // keep the dialog. The swipe path does not: revealing and then tapping is
    // already two, and a third would make the fast path the slow one.
    const confirmThenDelete = useCallback(
        async (expense) => {
            const label = expense.notes || expense.category?.name || t('expenses.thisExpense');

            const confirmed = await confirm({
                title: t('expenses.deleteTitle'),
                message: `${label} — ${formatCurrency(expense.amount)}`,
                confirmLabel: t('expenses.deleteConfirm'),
                destructive: true,
            });

            if (confirmed) {
                performDelete(expense);
            }
        },
        [confirm, t, performDelete]
    );

    const selectedCategoryName = useMemo(() => {
        if (categoryId === ALL_CATEGORIES) {
            return '';
        }
        return (categories ?? []).find((c) => c.id === categoryId)?.name ?? '';
    }, [categories, categoryId]);

    // One pass over a month of expenses, recomputed only when the list or
    // either control changes.
    const filtered = useMemo(
        () => filterExpenses(expenses, { query, categoryId }),
        [expenses, query, categoryId]
    );

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

    // Four different situations that all look like an empty list, and each
    // wants a different next step. Offering "add your first expense" to
    // somebody who has forty of them behind a filter is the app not knowing
    // what is going on.
    const renderEmpty = () => {
        const kind = emptyKind({ monthCount: expenses.length, query, categoryId });

        if (kind === EMPTY_MONTH) {
            return (
                <EmptyState
                    icon={Receipt}
                    title={t('expenses.emptyTitle')}
                    message={t('expenses.emptyMsg')}
                    actionLabel={t('home.addExpense')}
                    onAction={() => navigation.navigate('Add')}
                />
            );
        }

        if (kind === EMPTY_SEARCH) {
            return (
                <EmptyState
                    icon={Search}
                    title={t('expenses.noMatchesTitle')}
                    message={t('expenses.noMatchesMsg', { query })}
                    actionLabel={t('expenses.clearSearch')}
                    onAction={() => setQuery('')}
                />
            );
        }

        if (kind === EMPTY_CATEGORY) {
            return (
                <EmptyState
                    icon={SlidersHorizontal}
                    title={t('expenses.noCategoryTitle')}
                    message={t('expenses.noCategoryMsg', { category: selectedCategoryName })}
                    actionLabel={t('expenses.clearFilter')}
                    onAction={() => setCategoryId(ALL_CATEGORIES)}
                />
            );
        }

        // Both. Clearing only one of them would usually still show nothing,
        // so the single action clears the pair.
        return (
            <EmptyState
                icon={SlidersHorizontal}
                title={t('expenses.noMatchesTitle')}
                message={t('expenses.noBothMsg', { query, category: selectedCategoryName })}
                actionLabel={t('expenses.clearAll')}
                onAction={() => {
                    setQuery('');
                    setCategoryId(ALL_CATEGORIES);
                }}
            />
        );
    };

    const renderItem = ({ item }) => (
        <SwipeableRow
            ref={(row) => {
                if (!row) {
                    return;
                }
                rowRefs.current.set(item.id, row);
            }}
            onSwipeOpen={() => {
                // Opening a second row closes the first, so the list never
                // carries a trail of half-swiped rows.
                const next = rowRefs.current.get(item.id);
                if (openRow.current && openRow.current !== next) {
                    openRow.current.close?.();
                }
                openRow.current = next;
            }}
            onDelete={() => performDelete(item)}
        >
        <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('EditExpense', { expense: item })}
            onLongPress={() => confirmThenDelete(item)}
            activeOpacity={0.7}
            // The swipe is a shortcut, never the only way. A screen reader
            // reaches the same delete through the actions rotor, and it goes
            // through the confirmation rather than straight to removal.
            accessibilityActions={ROW_ACTIONS}
            onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'delete') {
                    confirmThenDelete(item);
                }
            }}
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
        </SwipeableRow>
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

                {/* Below the search field rather than beside it: two controls
                    sharing a row would leave neither enough width once a
                    category name is longer than a word. */}
                <CategoryFilter
                    categories={categoryQuery.data ?? NO_CATEGORIES}
                    value={categoryId}
                    onChange={setCategoryId}
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
                    // Scrolling away from an open row is a clear signal it is
                    // no longer wanted, and leaving it open puts a delete
                    // button under a thumb that is reaching for a row.
                    onScrollBeginDrag={closeOpenRow}
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
                    ListEmptyComponent={renderEmpty()}
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
