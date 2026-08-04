import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Users, Pencil, Archive, ChevronRight, Receipt } from 'lucide-react-native';

import Card from '../../components/Card';
import Button from '../../components/Button';
import ErrorState from '../../components/ErrorState';
import ScreenHeader from '../../components/ScreenHeader';
import { GroupListSkeleton } from '../../components/ScreenSkeletons';
import { useFeedback } from '../../components/FeedbackProvider';
import { resolveViewState, LOADING, ERROR } from '../../utils/viewState';
import { errorMessage } from '../../utils/error';
import haptics from '../../services/haptics';
import { radius, spacing, useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import { useGroup, useUnarchiveGroup } from '../../hooks/useGroups';

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
    const group = query.data;
    const unarchiveGroup = useUnarchiveGroup();

    const state = resolveViewState({
        isPending: query.isPending,
        hasData: query.data !== undefined,
        error: query.error,
    });

    const archived = Boolean(group?.archivedAt);
    const members = group?.members ?? [];
    const activeMembers = members.filter((member) => !member.archivedAt);

    const memberLabel = (count) =>
        count === 1 ? t('groups.memberOne') : t('groups.memberMany', { count });

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
                        onRefresh={query.refetch}
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
                <Card>
                    {/* One honest sentence rather than an empty list with an
                        add button that opens a form which does not exist yet.
                        The editor arrives in the next phase, and until it does
                        an "Add shared expense" action here would be a promise
                        the app cannot keep. */}
                    <View style={styles.future}>
                        <Receipt
                            color={colors.textMuted}
                            size={18}
                            importantForAccessibility="no-hide-descendants"
                        />
                        <Text style={styles.futureText}>{t('groups.expensesComing')}</Text>
                    </View>
                </Card>

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
