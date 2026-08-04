import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
    Search,
    X,
    Plus,
    PieChart,
    BarChart3,
    Tag,
    UserCog,
    Settings as SettingsIcon,
    Receipt,
    SearchX,
    Users,
} from 'lucide-react-native';

import Input from '../components/Input';
import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { queryKeys } from '../lib/queryKeys';
import { searchExpenses, searchCategories, searchActions } from '../utils/search';
import { formatCurrency, formatDayLabel, formatMonthYear } from '../utils/format';
import haptics from '../services/haptics';
import { expenseRoute } from '../utils/sharedExpense';

// Searches what the app already has, and says so.
//
// Every expense here came out of the React Query cache, which holds the months
// the user has actually opened. That is an honest scope and it is stated on
// screen: claiming to search a history that would need a request per month —
// and a backend endpoint that does not exist — would be a search box that
// quietly fails to find things people know they entered.
//
// Nothing here fetches. Reading the cache directly rather than through the
// hooks means opening search cannot fire a request, let alone one per
// keystroke.

// Static, so they are searchable before anything has loaded. Each carries a
// translated label and a translated bag of keywords, which is what lets
// "gastos" and "expense" both reach the same place.
const ACTIONS = [
    { key: 'add', icon: Plus, labelKey: 'search.actionAdd', keywordsKey: 'search.keywordsAdd' },
    { key: 'budget', icon: PieChart, labelKey: 'search.actionBudget', keywordsKey: 'search.keywordsBudget' },
    { key: 'expenses', icon: Receipt, labelKey: 'search.actionExpenses', keywordsKey: 'search.keywordsExpenses' },
    { key: 'reports', icon: BarChart3, labelKey: 'search.actionReports', keywordsKey: 'search.keywordsReports' },
    { key: 'categories', icon: Tag, labelKey: 'search.actionCategories', keywordsKey: 'search.keywordsCategories' },
    { key: 'profile', icon: UserCog, labelKey: 'search.actionProfile', keywordsKey: 'search.keywordsProfile' },
    { key: 'settings', icon: SettingsIcon, labelKey: 'search.actionSettings', keywordsKey: 'search.keywordsSettings' },
    { key: 'groups', icon: Users, labelKey: 'search.actionGroups', keywordsKey: 'search.keywordsGroups' },
];

// Tabs live inside the navigator this screen was pushed above, so reaching one
// means naming it on the way. Stack destinations are siblings and are reached
// directly.
const DESTINATIONS = {
    add: ['Main', { screen: 'Add' }],
    budget: ['Main', { screen: 'Budget' }],
    expenses: ['Main', { screen: 'Expenses' }],
    settings: ['Main', { screen: 'Settings' }],
    reports: ['Reports'],
    categories: ['Categories'],
    profile: ['EditProfile'],
    groups: ['Groups'],
};

const GlobalSearchScreen = ({ navigation }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();
    const queryClient = useQueryClient();

    const [query, setQuery] = useState('');
    // Navigating unmounts this screen, but a second tap can land in the same
    // batch before it does — which would push the destination twice.
    const leaving = useRef(false);

    // Read once. A snapshot is the right model for a screen that opens, gets
    // typed into and closes; subscribing would re-rank results underneath the
    // user's finger every time a background refetch landed.
    const { expenses, months } = useMemo(() => {
        const entries = queryClient.getQueriesData({ queryKey: queryKeys.expenses.all });
        const all = [];
        const seen = [];

        entries.forEach(([key, data]) => {
            if (!Array.isArray(data) || data.length === 0) {
                return;
            }
            // ['expenses', year, month]
            const [, year, month] = key;
            if (typeof year === 'number' && typeof month === 'number') {
                seen.push({ year, month });
            }
            all.push(...data);
        });

        seen.sort((a, b) => a.year - b.year || a.month - b.month);
        return { expenses: all, months: seen };
    }, [queryClient]);

    const categories = useMemo(
        () => queryClient.getQueryData(queryKeys.categories.all) ?? [],
        [queryClient]
    );

    const actions = useMemo(
        () =>
            ACTIONS.map((action) => ({
                ...action,
                label: t(action.labelKey),
                keywords: t(action.keywordsKey),
            })),
        [t]
    );

    // Says exactly which months were looked at, rather than a vague promise.
    const scopeLabel = useMemo(() => {
        if (months.length === 0) {
            return t('search.scopeNone');
        }

        const first = months[0];
        const last = months[months.length - 1];
        const from = formatMonthYear(first.month, first.year);

        if (months.length === 1) {
            return t('search.scopeOne', { month: from });
        }

        return t('search.scopeRange', {
            from,
            to: formatMonthYear(last.month, last.year),
        });
    }, [months, t]);

    // Local data, so no debounce: an artificial delay on work that takes well
    // under a millisecond only makes the screen feel slower than it is.
    const matchedActions = useMemo(() => searchActions(actions, query), [actions, query]);
    const matchedExpenses = useMemo(() => searchExpenses(expenses, query), [expenses, query]);
    const matchedCategories = useMemo(
        () => searchCategories(categories, query),
        [categories, query]
    );

    const go = useCallback(
        (run) => {
            if (leaving.current) {
                return;
            }
            leaving.current = true;
            haptics.light();
            run();
        },
        []
    );

    const openExpense = useCallback(
        (expense) => go(() => navigation.navigate(...expenseRoute(expense))),
        [go, navigation]
    );

    const openAction = useCallback(
        (key) => go(() => navigation.navigate(...DESTINATIONS[key])),
        [go, navigation]
    );

    // Categories open the management screen. Focusing one row inside it would
    // need state this architecture does not carry, and a highlight that
    // sometimes lands on the wrong row is worse than none.
    const openCategories = useCallback(() => go(() => navigation.navigate('Categories')), [go, navigation]);

    const sections = useMemo(() => {
        const built = [];

        if (matchedActions.length > 0) {
            built.push({ key: 'actions', title: t('search.groupActions'), data: matchedActions });
        }

        if (matchedExpenses.length > 0) {
            built.push({
                key: 'expenses',
                title: t('search.groupExpenses'),
                data: matchedExpenses,
            });
        }

        if (matchedCategories.length > 0) {
            built.push({
                key: 'categories',
                title: t('search.groupCategories'),
                data: matchedCategories,
            });
        }

        return built;
    }, [matchedActions, matchedExpenses, matchedCategories, t]);

    const renderItem = ({ item, section }) => {
        if (section.key === 'actions') {
            const Icon = item.icon;

            return (
                <TouchableOpacity
                    style={styles.row}
                    onPress={() => openAction(item.key)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                >
                    <View style={styles.icon} importantForAccessibility="no-hide-descendants">
                        <Icon color={colors.brand} size={18} />
                    </View>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                        {item.label}
                    </Text>
                </TouchableOpacity>
            );
        }

        if (section.key === 'categories') {
            return (
                <TouchableOpacity
                    style={styles.row}
                    onPress={openCategories}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                    accessibilityHint={t('search.categoryHint')}
                >
                    <View
                        style={[styles.dot, { backgroundColor: item.color || colors.textMuted }]}
                        importantForAccessibility="no-hide-descendants"
                    />
                    <Text style={styles.rowTitle} numberOfLines={1}>
                        {item.name}
                    </Text>
                </TouchableOpacity>
            );
        }

        const title = item.notes || item.category?.name || t('home.expenseFallback');
        const context = `${item.category?.name || t('expenses.uncategorised')} · ${formatDayLabel(item.date)}`;

        return (
            <TouchableOpacity
                style={styles.row}
                onPress={() => openExpense(item)}
                activeOpacity={0.7}
                accessibilityRole="button"
                // Read as one sentence rather than four fragments, and carrying
                // only what is already on the row.
                accessibilityLabel={`${title}. ${context}. ${formatCurrency(item.amount)}`}
            >
                <View
                    style={[
                        styles.dot,
                        { backgroundColor: item.category?.color || colors.textMuted },
                    ]}
                    importantForAccessibility="no-hide-descendants"
                />
                <View style={styles.rowMain}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                        {title}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                        {context}
                    </Text>
                </View>
                <Text style={styles.rowAmount}>−{formatCurrency(item.amount)}</Text>
            </TouchableOpacity>
        );
    };

    const typed = query.trim() !== '';
    const nothingFound = typed && sections.length === 0;

    return (
        <View style={styles.container}>
            <ScreenHeader
                title={t('search.title')}
                subtitle={scopeLabel}
                onBack={() => navigation.goBack()}
            />

            <View style={styles.field}>
                <Input
                    value={query}
                    onChangeText={setQuery}
                    placeholder={t('search.placeholder')}
                    label={t('search.fieldLabel')}
                    autoCapitalize="none"
                    // Focus starts here, which is the only reason to be on this
                    // screen at all.
                    autoFocus
                    returnKeyType="search"
                    leftIcon={<Search color={colors.textMuted} size={17} />}
                    rightSlot={
                        typed ? (
                            <TouchableOpacity
                                onPress={() => setQuery('')}
                                hitSlop={hitSlop}
                                accessibilityRole="button"
                                accessibilityLabel={t('search.clear')}
                            >
                                <X color={colors.textMuted} size={17} />
                            </TouchableOpacity>
                        ) : null
                    }
                />
            </View>

            {nothingFound ? (
                <EmptyState
                    icon={SearchX}
                    title={t('search.noResultsTitle')}
                    // Says where it looked, so "it is not there" and "it was
                    // not looked at" cannot be confused.
                    message={t('search.noResultsMsg', { query: query.trim(), scope: scopeLabel })}
                    actionLabel={t('search.clear')}
                    onAction={() => setQuery('')}
                />
            ) : (
                <SectionList
                    sections={sections}
                    keyExtractor={(item, index) => `${item.key ?? item.id}-${index}`}
                    renderItem={renderItem}
                    renderSectionHeader={({ section }) => (
                        <Text style={styles.sectionHeader} accessibilityRole="header">
                            {section.title}
                        </Text>
                    )}
                    contentContainerStyle={styles.list}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    showsVerticalScrollIndicator={false}
                    stickySectionHeadersEnabled={false}
                />
            )}
        </View>
    );
};

const hitSlop = { top: 12, bottom: 12, left: 12, right: 12 };

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.canvas,
        },
        field: {
            paddingHorizontal: spacing.l,
            paddingBottom: spacing.s,
        },
        list: {
            paddingHorizontal: spacing.l,
            paddingBottom: spacing.xxxl,
        },
        sectionHeader: {
            ...typography.overline,
            marginTop: spacing.l,
            marginBottom: spacing.s,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.m,
            // Comfortably past the 44pt minimum for a list of tap targets.
            minHeight: 56,
            paddingHorizontal: spacing.l,
            paddingVertical: spacing.m,
            marginBottom: spacing.s,
        },
        icon: {
            width: 34,
            height: 34,
            borderRadius: radius.s,
            backgroundColor: colors.brandTint,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: spacing.m,
        },
        dot: {
            width: 10,
            height: 10,
            borderRadius: radius.round,
            marginRight: spacing.m,
        },
        rowMain: {
            flex: 1,
        },
        rowTitle: {
            flex: 1,
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
            fontSize: 15,
            fontWeight: '600',
            color: colors.textPrimary,
            marginLeft: spacing.m,
            fontVariant: ['tabular-nums'],
        },
    });

export default GlobalSearchScreen;
