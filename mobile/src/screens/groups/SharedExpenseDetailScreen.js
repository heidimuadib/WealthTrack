import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Pencil, Trash2 } from 'lucide-react-native';

import Card from '../../components/Card';
import Button from '../../components/Button';
import ErrorState from '../../components/ErrorState';
import ScreenHeader from '../../components/ScreenHeader';
import { GroupListSkeleton } from '../../components/ScreenSkeletons';
import { useFeedback } from '../../components/FeedbackProvider';
import { resolveViewState, LOADING, ERROR } from '../../utils/viewState';
import { errorMessage } from '../../utils/error';
import { formatCurrency, formatDayLabel } from '../../utils/format';
import { toCentavos, methodFromServer } from '../../utils/splitMath';
import haptics from '../../services/haptics';
import { radius, spacing, useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import { useGroup, useGroupExpenses, useDeleteSharedExpense } from '../../hooks/useGroups';
import { useCategories } from '../../hooks/useCategories';

// Route params: { groupId, sharedExpenseId }

const METHOD_LABELS = {
    equal: 'split.equal',
    fixed: 'split.fixed',
    percentage: 'split.percentage',
    shares: 'split.shares',
};

const SharedExpenseDetailScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();
    const { confirm, notify, alert } = useFeedback();

    const { groupId, sharedExpenseId } = route.params ?? {};

    const groupQuery = useGroup(groupId);
    const expenseQuery = useGroupExpenses(groupId);
    const categoryQuery = useCategories();
    const deleteExpense = useDeleteSharedExpense();

    const group = groupQuery.data;
    const expense = (expenseQuery.data ?? []).find((row) => row.id === sharedExpenseId);
    const archived = Boolean(group?.archivedAt);

    const state = resolveViewState({
        isPending: groupQuery.isPending || expenseQuery.isPending,
        hasData: groupQuery.data !== undefined && expenseQuery.data !== undefined,
        error: groupQuery.error || expenseQuery.error,
    });

    const members = group?.members ?? [];
    const nameFor = (memberId) => members.find((m) => m.id === memberId)?.name ?? '';
    const self = members.find((member) => member.isCurrentUser);

    const totalCentavos = expense ? (toCentavos(String(expense.amount)) ?? 0) : 0;
    const myShare = expense?.shares?.find((share) => share.memberId === self?.id);
    const myShareCentavos = myShare ? (toCentavos(String(myShare.amount)) ?? 0) : 0;
    const iPaid = expense?.payerMemberId === self?.id;

    const categoryName = (categoryQuery.data ?? []).find(
        (category) => category.id === expense?.categoryId
    )?.name;

    const handleDelete = async () => {
        const confirmed = await confirm({
            title: t('shared.deleteTitle'),
            // Says exactly what goes and, just as importantly, what stays:
            // repayments already recorded are not deleted, so a balance can
            // move and somebody can end up holding a credit.
            message: t('shared.deleteMsg'),
            confirmLabel: t('shared.delete'),
            destructive: true,
        });
        if (!confirmed) {
            return;
        }

        try {
            await deleteExpense.mutateAsync({ groupId, expenseId: sharedExpenseId });
            // Warning, not success. Something irreversible just happened.
            haptics.warning();
            notify({ message: t('shared.deleted') });
            navigation.goBack();
        } catch (error) {
            haptics.error();
            alert({ title: t('shared.delete'), message: errorMessage(error) });
        }
    };

    const header = (
        <ScreenHeader
            title={expense?.description || t('groups.routeExpenseDetail')}
            subtitle={group?.name}
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

    if (state === ERROR || !expense) {
        return (
            <View style={styles.container}>
                {header}
                <ErrorState
                    error={groupQuery.error || expenseQuery.error}
                    onRetry={expenseQuery.refetch}
                />
            </View>
        );
    }

    // Plain sentences rather than a ledger. Somebody reading this wants to know
    // what they paid, what they used, and what that means for their own money —
    // not which table a row lives in.
    const story = [];
    if (iPaid) {
        story.push(t('shared.youPaid', { amount: formatCurrency(totalCentavos / 100) }));
    } else {
        story.push(
            t('shared.someonePaid', {
                name: nameFor(expense.payerMemberId),
                amount: formatCurrency(totalCentavos / 100),
            })
        );
    }

    if (myShare) {
        story.push(t('shared.yourShare', { amount: formatCurrency(myShareCentavos / 100) }));
        if (iPaid && totalCentavos > myShareCentavos) {
            story.push(
                t('shared.paidForOthers', {
                    amount: formatCurrency((totalCentavos - myShareCentavos) / 100),
                })
            );
        }
    } else {
        story.push(t('shared.notIncluded'));
    }

    return (
        <View style={styles.container}>
            {header}

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <Card>
                    <Text style={styles.total}>{formatCurrency(totalCentavos / 100)}</Text>
                    <Text style={styles.meta}>
                        {[formatDayLabel(expense.date), categoryName].filter(Boolean).join(' · ')}
                    </Text>

                    <View style={styles.story}>
                        {story.map((line) => (
                            <Text key={line} style={styles.storyLine}>
                                {line}
                            </Text>
                        ))}
                    </View>

                    {/* The mirror, in the language of somebody's own expenses
                        rather than of the table it lives in. */}
                    <Text style={styles.mirror}>
                        {expense.hasPersonalShare ? t('shared.mirrorYes') : t('shared.mirrorNo')}
                    </Text>
                </Card>

                {expense.note ? (
                    <Card style={styles.noteCard}>
                        <Text style={styles.note}>{expense.note}</Text>
                    </Card>
                ) : null}

                <Text style={styles.sectionTitle} accessibilityRole="header">
                    {t('shared.breakdown')}
                </Text>
                <Card padded={false}>
                    <Text style={styles.methodLine}>
                        {t(METHOD_LABELS[methodFromServer(expense.splitMethod)])}
                    </Text>
                    {expense.shares.map((share) => {
                        const name = nameFor(share.memberId);
                        const amount = formatCurrency(share.amount);

                        return (
                            <View
                                key={share.memberId}
                                style={styles.row}
                                accessible
                                accessibilityLabel={t('shared.a11yShare', { name, amount })}
                            >
                                <Text style={styles.rowName} numberOfLines={1}>
                                    {share.memberId === self?.id ? t('members.you') : name}
                                </Text>
                                {share.splitInput ? (
                                    <Text style={styles.rowInput}>{share.splitInput}</Text>
                                ) : null}
                                <Text style={styles.rowAmount}>{amount}</Text>
                            </View>
                        );
                    })}
                </Card>

                {/* Nothing may be changed in an archived group, so the actions
                    are absent rather than present and refused. */}
                {archived ? (
                    <Text style={styles.archivedNotice}>{t('groups.archivedNotice')}</Text>
                ) : (
                    <View style={styles.actions}>
                        <Button
                            title={t('shared.edit')}
                            onPress={() =>
                                navigation.navigate('EditSharedExpense', {
                                    groupId,
                                    sharedExpenseId,
                                })
                            }
                            variant="secondary"
                            icon={<Pencil color={colors.brand} size={16} />}
                            style={styles.action}
                        />
                        <Button
                            title={t('shared.delete')}
                            onPress={handleDelete}
                            variant="danger"
                            loading={deleteExpense.isPending}
                            icon={<Trash2 color={colors.danger} size={16} />}
                            style={styles.action}
                        />
                    </View>
                )}
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
        total: {
            fontSize: 32,
            fontFamily: 'SpaceGrotesk-Bold',
            letterSpacing: -0.8,
            color: colors.textPrimary,
        },
        meta: {
            ...typography.caption,
            marginTop: 2,
        },
        story: {
            marginTop: spacing.l,
            paddingTop: spacing.m,
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
        storyLine: {
            fontSize: 14,
            color: colors.textPrimary,
            marginBottom: spacing.xs,
        },
        mirror: {
            ...typography.caption,
            marginTop: spacing.m,
        },
        noteCard: {
            marginTop: spacing.l,
        },
        note: {
            ...typography.body,
        },
        sectionTitle: {
            ...typography.overline,
            marginTop: spacing.xl,
            marginBottom: spacing.s,
        },
        methodLine: {
            ...typography.caption,
            paddingHorizontal: spacing.l,
            paddingTop: spacing.l,
            paddingBottom: spacing.s,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 48,
            paddingHorizontal: spacing.l,
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
        rowName: {
            flex: 1,
            fontSize: 14,
            fontWeight: '500',
            color: colors.textPrimary,
        },
        rowInput: {
            fontSize: 12,
            color: colors.textMuted,
            marginRight: spacing.m,
            paddingHorizontal: spacing.s,
            paddingVertical: 2,
            borderRadius: radius.round,
            backgroundColor: colors.surfaceAlt,
        },
        rowAmount: {
            fontSize: 14,
            fontWeight: '600',
            color: colors.textPrimary,
            fontVariant: ['tabular-nums'],
        },
        archivedNotice: {
            ...typography.caption,
            marginTop: spacing.xl,
        },
        actions: {
            marginTop: spacing.xl,
        },
        action: {
            marginBottom: spacing.m,
        },
    });

export default SharedExpenseDetailScreen;
