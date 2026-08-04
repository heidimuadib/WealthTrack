import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Users, Plus, Archive } from 'lucide-react-native';

import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import ScreenHeader from '../../components/ScreenHeader';
import { GroupListSkeleton } from '../../components/ScreenSkeletons';
import { resolveViewState, LOADING, ERROR } from '../../utils/viewState';
import { radius, spacing, useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import { useGroups } from '../../hooks/useGroups';

// Route params: none

const NO_GROUPS = [];

// Active and archived are two lists, never one with a label mixed in. A
// finished trip sitting among the live ones is noise on the screen somebody
// opens to see what they owe — and the two are separate cache entries anyway.
const GroupsScreen = ({ navigation }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();

    const [archived, setArchived] = useState(false);

    // Only the visible list is asked for. The other tab's query starts when it
    // is switched to, rather than both loading on arrival.
    const query = useGroups(archived);

    const groups = query.data ?? NO_GROUPS;
    const state = resolveViewState({
        isPending: query.isPending,
        hasData: query.data !== undefined,
        error: query.error,
    });

    const openGroup = useCallback(
        (groupId) => navigation.navigate('GroupDetail', { groupId }),
        [navigation]
    );

    const memberLabel = useCallback(
        (count) => (count === 1 ? t('groups.memberOne') : t('groups.memberMany', { count })),
        [t]
    );

    const renderItem = useCallback(
        ({ item }) => {
            const isArchived = Boolean(item.archivedAt);
            // One sentence rather than four fragments, with the archived state
            // said out loud — the muted styling and the badge are both things a
            // screen reader cannot report.
            const label = [
                item.name,
                item.description,
                memberLabel(item.memberCount),
                isArchived ? t('groups.archivedBadge') : null,
            ]
                .filter(Boolean)
                .join('. ');

            return (
                <TouchableOpacity
                    style={[styles.card, isArchived && styles.cardArchived]}
                    onPress={() => openGroup(item.id)}
                    activeOpacity={0.7}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={label}
                >
                    <View
                        style={[styles.marker, { backgroundColor: item.color || colors.brand }]}
                        importantForAccessibility="no-hide-descendants"
                    />

                    <View style={styles.main}>
                        <View style={styles.titleLine}>
                            <Text style={styles.name} numberOfLines={1}>
                                {item.name}
                            </Text>
                            {isArchived ? (
                                <View style={styles.badge}>
                                    <Archive color={colors.textMuted} size={10} />
                                    <Text style={styles.badgeText}>
                                        {t('groups.archivedBadge')}
                                    </Text>
                                </View>
                            ) : null}
                        </View>

                        {item.description ? (
                            <Text style={styles.description} numberOfLines={1}>
                                {item.description}
                            </Text>
                        ) : null}

                        {/* A member count, and no balance. The list endpoint
                            carries no figures, and a zero here would be
                            indistinguishable from a group that is settled. */}
                        <Text style={styles.meta}>{memberLabel(item.memberCount)}</Text>
                    </View>
                </TouchableOpacity>
            );
        },
        [styles, colors, t, memberLabel, openGroup]
    );

    const renderEmpty = () =>
        archived ? (
            <EmptyState
                icon={Archive}
                title={t('groups.emptyArchivedTitle')}
                message={t('groups.emptyArchivedMsg')}
            />
        ) : (
            <EmptyState
                icon={Users}
                title={t('groups.emptyTitle')}
                message={t('groups.emptyMsg')}
                actionLabel={t('groups.create')}
                onAction={() => navigation.navigate('CreateGroup')}
            />
        );

    return (
        <View style={styles.container}>
            <ScreenHeader title={t('groups.title')} onBack={() => navigation.goBack()} />

            <View style={styles.toggleWrap}>
                <View style={styles.toggle}>
                    {[false, true].map((value) => {
                        const selected = archived === value;
                        const label = value ? t('groups.tabArchived') : t('groups.tabActive');

                        return (
                            <TouchableOpacity
                                key={String(value)}
                                style={[
                                    styles.toggleOption,
                                    selected && styles.toggleOptionActive,
                                ]}
                                onPress={() => setArchived(value)}
                                activeOpacity={0.75}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                accessibilityLabel={label}
                            >
                                <Text
                                    style={[
                                        styles.toggleText,
                                        selected && styles.toggleTextActive,
                                    ]}
                                >
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            {state === LOADING ? (
                <GroupListSkeleton />
            ) : state === ERROR ? (
                <ErrorState error={query.error} onRetry={query.refetch} />
            ) : (
                <FlatList
                    data={groups}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={[styles.list, groups.length === 0 && styles.listEmpty]}
                    ListEmptyComponent={renderEmpty}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={query.isRefetching}
                            onRefresh={query.refetch}
                            tintColor={colors.brand}
                        />
                    }
                />
            )}

            {/* Absent on the archived tab: offering "create" from a list of
                finished trips reads as creating an archived one. */}
            {archived ? null : (
                <View style={styles.footer}>
                    <Button
                        title={t('groups.create')}
                        onPress={() => navigation.navigate('CreateGroup')}
                        icon={<Plus color={colors.onBrand} size={17} />}
                    />
                </View>
            )}
        </View>
    );
};

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.canvas,
        },
        toggleWrap: {
            paddingHorizontal: spacing.l,
            paddingBottom: spacing.m,
        },
        toggle: {
            flexDirection: 'row',
            backgroundColor: colors.surfaceAlt,
            borderRadius: radius.round,
            padding: 3,
        },
        toggleOption: {
            flex: 1,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.round,
        },
        toggleOptionActive: {
            backgroundColor: colors.surface,
        },
        toggleText: {
            fontSize: 13,
            fontWeight: '600',
            color: colors.textMuted,
        },
        toggleTextActive: {
            color: colors.textPrimary,
        },
        list: {
            paddingHorizontal: spacing.l,
            paddingBottom: spacing.xxxl,
        },
        listEmpty: {
            flexGrow: 1,
            justifyContent: 'center',
        },
        card: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 64,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.m,
            paddingHorizontal: spacing.l,
            paddingVertical: spacing.m,
            marginBottom: spacing.s,
        },
        // Subdued by opacity and a dashed edge rather than by a colour that
        // would read as an error — and never the only signal, since the badge
        // and the accessibility label both say it too.
        cardArchived: {
            opacity: 0.72,
            borderStyle: 'dashed',
        },
        marker: {
            width: 10,
            height: 10,
            borderRadius: radius.round,
            marginRight: spacing.m,
        },
        main: {
            flex: 1,
        },
        titleLine: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        name: {
            flexShrink: 1,
            fontSize: 15,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        badge: {
            flexDirection: 'row',
            alignItems: 'center',
            marginLeft: spacing.s,
            paddingHorizontal: spacing.s,
            paddingVertical: 2,
            borderRadius: radius.round,
            backgroundColor: colors.surfaceAlt,
        },
        badgeText: {
            marginLeft: 4,
            fontSize: 10,
            fontWeight: '700',
            color: colors.textMuted,
        },
        description: {
            ...typography.caption,
            marginTop: 2,
        },
        meta: {
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 2,
        },
        footer: {
            paddingHorizontal: spacing.l,
            paddingTop: spacing.s,
            paddingBottom: spacing.l,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.canvas,
        },
    });

export default GroupsScreen;
