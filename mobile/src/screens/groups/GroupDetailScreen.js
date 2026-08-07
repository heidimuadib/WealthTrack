import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Users, Pencil, Archive, ChevronRight, Receipt, Plus } from 'lucide-react-native';

import Card from '../../components/Card';
import Button from '../../components/Button';
import ErrorState from '../../components/ErrorState';
import ScreenHeader from '../../components/ScreenHeader';
import GroupBalances from '../../components/GroupBalances';
import { GroupListSkeleton } from '../../components/ScreenSkeletons';
import { useFeedback } from '../../components/FeedbackProvider';
import { resolveViewState, LOADING, ERROR } from '../../utils/viewState';
import { errorMessage } from '../../utils/error';
import haptics from '../../services/haptics';
import { formatCurrency, formatDayLabel } from '../../utils/format';
import { radius, spacing, useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import {
    useGroup,
    useGroupBalances,
    useGroupExpenses,
    useUnarchiveGroup,
} from '../../hooks/useGroups';

// Route params: { groupId }

// How many members to show before the row simply says how many there are.
const PREVIEW = 4;

const GroupDetailScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();
    const { notify, alert } = useFeedback();

    const groupId = route.params?.groupId;
    const query = useGroup(groupId);
    const expensesQuery = useGroupExpenses(groupId);
    // One request for the whole section. Every figure and every pair the screen
    // shows comes out of this single response — nothing is fetched per member
    // and nothing per pair.
    const balancesQuery = useGroupBalances(groupId);
    const group = query.data;
    const expenses = expensesQuery.data ?? [];
    const unarchiveGroup = useUnarchiveGroup();

    const state = resolveViewState({
        isPending: query.isPending,
        hasData: query.data !== undefined,
        error: query.error,
    });

    const archived = Boolean(group?.archivedAt);
    const members = group?.members ?? [];
    const activeMembers = members.filter((member) => !member.archivedAt);

    const nameOf = (memberId) => members.find((m) => m.id === memberId)?.name ?? '';

    const memberLabel = (count) =>
        count === 1 ? t('groups.memberOne') : t('groups.memberMany', { count });

    // Stable across renders so the refresh control does not get a new callback
    // on every keystroke elsewhere on the screen.
    const refreshAll = useCallback(() => {
        query.refetch();
        expensesQuery.refetch();
        balancesQuery.refetch();
    }, [query, expensesQuery, balancesQuery]);

    const handleUnarchive = async () => {
        if (unarchiveGroup.isPending) {
            return;
        }
        try {
            await unarchiveGroup.mutateAsync(groupId);
            haptics.success();
            notify({ message: t('groups.unarchived') });
        } catch (error) {
            haptics.error();
            alert({ title: t('groups.unarchive'), message: errorMessage(error) });
        }
    };

    const header = (
        <ScreenHeader
            title={group?.name || t('groups.routeDetail')}
            onBack={() => navigation.goBack()}
        />
    );

    if (state === LOADING) {
        return (
            <View style={styles.container}>
                {header}
                <GroupListSkeleton />
            </View>
        );
    }

    if (state === ERROR) {
        return (
            <View style={styles.container}>
                {header}
                <ErrorState error={query.error} onRetry={query.refetch} />
            </View>
        );
    }

    const actionRow = (label, hint, icon, onPress) => (
        <TouchableOpacity
            style={styles.row}
            onPress={onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={hint}
        >
            <View style={styles.rowIcon} importantForAccessibility="no-hide-descendants">
                {icon}
            </View>
            <Text style={styles.rowTitle}>{label}</Text>
            <ChevronRight color={colors.textMuted} size={18} />
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            {header}

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={query.isRefetching}
                        // The three things this screen actually shows, and
                        // nothing else: no other group is touched, and the
                        // settlements list is not fetched here because no part
                        // of this screen reads it yet.
                        onRefresh={refreshAll}
                        tintColor={colors.brand}
                    />
                }
            >
                <Card>
                    <View style={styles.identity}>
                        <View
                            style={[
                                styles.marker,
                                { backgroundColor: group.color || colors.brand },
                            ]}
                            importantForAccessibility="no-hide-descendants"
                        />
                        <View style={styles.identityText}>
                            <Text style={styles.name}>{group.name}</Text>
                            {group.description ? (
                                <Text style={styles.description}>{group.description}</Text>
                            ) : null}
                            <Text style={styles.meta}>{memberLabel(members.length)}</Text>
                        </View>
                    </View>

                    {archived ? (
                        <View style={styles.notice}>
                            <Archive
                                color={colors.textMuted}
                                size={14}
                                importantForAccessibility="no-hide-descendants"
                            />
                            <Text style={styles.noticeText}>{t('groups.archivedNotice')}</Text>
                        </View>
                    ) : null}
                </Card>

                {/* Directly under the group's identity and above everything
                    else: what somebody opens a group to find out is whether
                    they are up or down, not what was ordered on Tuesday.
                    `expensesAreKnownEmpty` is what lets the section tell "no
                    one owes anyone" apart from "nothing has been spent yet",
                    and it costs no request — the list is already here. */}
                <GroupBalances
                    query={balancesQuery}
                    archived={archived}
                    expensesAreKnownEmpty={
                        expensesQuery.data !== undefined && expenses.length === 0
                    }
                />

                <Text style={styles.sectionTitle} accessibilityRole="header">
                    {t('groups.membersTitle')}
                </Text>
                <Card padded={false}>
                    <View style={styles.preview}>
                        {activeMembers.slice(0, PREVIEW).map((member) => (
                            <View key={member.id} style={styles.previewChip}>
                                <Text style={styles.previewName} numberOfLines={1}>
                                    {member.isCurrentUser ? t('members.you') : member.name}
                                </Text>
                            </View>
                        ))}
                        {activeMembers.length > PREVIEW ? (
                            <View style={styles.previewChip}>
                                <Text style={styles.previewName}>
                                    +{activeMembers.length - PREVIEW}
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    {actionRow(
                        t('groups.manageMembers'),
                        memberLabel(members.length),
                        <Users color={colors.brand} size={18} />,
                        () => navigation.navigate('ManageGroupMembers', { groupId })
                    )}
                </Card>

                <Text style={styles.sectionTitle} accessibilityRole="header">
                    {t('groups.expensesTitle')}
                </Text>
                <Card padded={false}>
                    {expensesQuery.isPending ? (
                        <View style={styles.future}>
                            <View style={[styles.ghost, styles.ghostWide]} />
                            <View style={[styles.ghost, styles.ghostNarrow]} />
                        </View>
                    ) : expensesQuery.error ? (
                        <View style={styles.future}>
                            <Text style={styles.futureText}>{t('shared.loadFailed')}</Text>
                            <Button
                                title={t('errors.tryAgain')}
                                onPress={expensesQuery.refetch}
                                variant="secondary"
                                size="small"
                            />
                        </View>
                    ) : expenses.length === 0 ? (
                        <View style={styles.future}>
                            <Receipt
                                color={colors.textMuted}
                                size={18}
                                importantForAccessibility="no-hide-descendants"
                            />
                            <Text style={styles.futureText}>
                                {archived ? t('shared.emptyArchived') : t('shared.emptyMsg')}
                            </Text>
                        </View>
                    ) : (
                        // Newest first, straight from the one list request the
                        // group already made. Names come from the members
                        // loaded alongside, so no row costs a request.
                        expenses.map((expense, index) => {
                            const payer = nameOf(expense.payerMemberId);
                            const amount = formatCurrency(expense.amount);

                            return (
                                <TouchableOpacity
                                    key={expense.id}
                                    style={[styles.expenseRow, index > 0 && styles.rowDivider]}
                                    onPress={() =>
                                        navigation.navigate('SharedExpenseDetail', {
                                            groupId,
                                            sharedExpenseId: expense.id,
                                        })
                                    }
                                    activeOpacity={0.7}
                                    accessible
                                    accessibilityRole="button"
                                    accessibilityLabel={t('shared.a11yRow', {
                                        description: expense.description,
                                        payer: t('shared.paidBy', { name: payer }),
                                        amount,
                                    })}
                                >
                                    <View style={styles.expenseMain}>
                                        <View style={styles.expenseTitleLine}>
                                            <Text style={styles.expenseName} numberOfLines={1}>
                                                {expense.description}
                                            </Text>
                                            {expense.hasPersonalShare ? (
                                                <View style={styles.shareBadge}>
                                                    <Text style={styles.shareBadgeText}>
                                                        {t('shared.yourShareBadge')}
                                                    </Text>
                                                </View>
                                            ) : null}
                                        </View>
                                        <Text style={styles.expenseMeta} numberOfLines={1}>
                                            {[
                                                t('shared.paidBy', { name: payer }),
                                                formatDayLabel(expense.date),
                                                expense.shares.length === 1
                                                    ? t('shared.participantsOne')
                                                    : t('shared.participantsMany', {
                                                          count: expense.shares.length,
                                                      }),
                                            ].join(' · ')}
                                        </Text>
                                    </View>
                                    <Text style={styles.expenseAmount}>{amount}</Text>
                                </TouchableOpacity>
                            );
                        })
                    )}
                </Card>

                {/* Absent on an archived group: nothing may be added to one. */}
                {archived ? null : (
                    <Button
                        title={t('shared.add')}
                        onPress={() => navigation.navigate('AddSharedExpense', { groupId })}
                        icon={<Plus color={colors.onBrand} size={17} />}
                        style={styles.addExpense}
                    />
                )}

                <View style={styles.actions}>
                    {archived ? (
                        <Button
                            title={t('groups.unarchive')}
                            onPress={handleUnarchive}
                            loading={unarchiveGroup.isPending}
                            style={styles.action}
                        />
                    ) : (
                        <Button
                            title={t('groups.editGroup')}
                            onPress={() => navigation.navigate('EditGroup', { groupId })}
                            variant="secondary"
                            icon={<Pencil color={colors.brand} size={16} />}
                            style={styles.action}
                        />
                    )}
                </View>
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
        content: {
            paddingHorizontal: spacing.l,
            paddingBottom: spacing.xxxl,
        },
        identity: {
            flexDirection: 'row',
            alignItems: 'flex-start',
        },
        marker: {
            width: 12,
            height: 12,
            borderRadius: radius.round,
            marginTop: 5,
            marginRight: spacing.m,
        },
        identityText: {
            flex: 1,
        },
        name: {
            ...typography.h2,
        },
        description: {
            ...typography.caption,
            marginTop: 2,
        },
        meta: {
            fontSize: 12,
            color: colors.textMuted,
            marginTop: spacing.s,
        },
        notice: {
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: spacing.l,
            paddingTop: spacing.m,
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
        noticeText: {
            ...typography.caption,
            flex: 1,
            marginLeft: spacing.s,
        },
        sectionTitle: {
            ...typography.overline,
            marginTop: spacing.xl,
            marginBottom: spacing.s,
        },
        preview: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            paddingHorizontal: spacing.l,
            paddingTop: spacing.l,
        },
        previewChip: {
            paddingHorizontal: spacing.m,
            paddingVertical: spacing.xs,
            borderRadius: radius.round,
            backgroundColor: colors.surfaceAlt,
            marginRight: spacing.s,
            marginBottom: spacing.s,
            maxWidth: 150,
        },
        previewName: {
            fontSize: 12,
            fontWeight: '600',
            color: colors.textSecondary,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 56,
            paddingHorizontal: spacing.l,
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
        rowIcon: {
            width: 34,
            height: 34,
            borderRadius: radius.s,
            backgroundColor: colors.brandTint,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: spacing.m,
        },
        rowTitle: {
            flex: 1,
            fontSize: 15,
            fontWeight: '500',
            color: colors.textPrimary,
        },
        future: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: spacing.l,
        },
        ghost: {
            height: 12,
            borderRadius: radius.s,
            backgroundColor: colors.borderStrong,
            opacity: 0.5,
        },
        ghostWide: { width: '45%' },
        ghostNarrow: { width: '25%', marginLeft: spacing.m },
        expenseRow: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 56,
            paddingHorizontal: spacing.l,
            paddingVertical: spacing.m,
        },
        rowDivider: {
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
        expenseMain: { flex: 1 },
        expenseTitleLine: { flexDirection: 'row', alignItems: 'center' },
        expenseName: {
            flexShrink: 1,
            fontSize: 15,
            fontWeight: '500',
            color: colors.textPrimary,
        },
        shareBadge: {
            marginLeft: spacing.s,
            paddingHorizontal: spacing.s,
            paddingVertical: 2,
            borderRadius: radius.round,
            backgroundColor: colors.brandTint,
        },
        shareBadgeText: {
            fontSize: 10,
            fontWeight: '700',
            color: colors.brand,
        },
        expenseMeta: {
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 2,
        },
        expenseAmount: {
            marginLeft: spacing.m,
            fontSize: 15,
            fontWeight: '600',
            color: colors.textPrimary,
            fontVariant: ['tabular-nums'],
        },
        addExpense: {
            marginTop: spacing.m,
        },
        futureText: {
            ...typography.caption,
            flex: 1,
            marginLeft: spacing.m,
        },
        actions: {
            marginTop: spacing.xl,
        },
        action: {
            marginBottom: spacing.m,
        },
    });

export default GroupDetailScreen;
