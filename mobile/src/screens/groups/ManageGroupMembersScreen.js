import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, RefreshControl } from 'react-native';
import {
    UserPlus,
    MoreHorizontal,
    Pencil,
    Archive,
    ArchiveRestore,
    Trash2,
} from 'lucide-react-native';

import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import ScreenHeader from '../../components/ScreenHeader';
import ActionSheet from '../../components/ActionSheet';
import MemberEditor from '../../components/MemberEditor';
import { GroupListSkeleton } from '../../components/ScreenSkeletons';
import { useFeedback } from '../../components/FeedbackProvider';
import { resolveViewState, LOADING, ERROR } from '../../utils/viewState';
import { errorMessage } from '../../utils/error';
import haptics from '../../services/haptics';
import { radius, spacing, useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import {
    useGroup,
    useAddMember,
    useUpdateMember,
    useArchiveMember,
    useUnarchiveMember,
    useDeleteMember,
} from '../../hooks/useGroups';

// Route params: { groupId }

const ManageGroupMembersScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();
    const { confirm, notify, alert } = useFeedback();

    const groupId = route.params?.groupId;
    const query = useGroup(groupId);
    const group = query.data;
    const archived = Boolean(group?.archivedAt);

    const addMember = useAddMember();
    const updateMember = useUpdateMember();
    const archiveMember = useArchiveMember();
    const unarchiveMember = useUnarchiveMember();
    const deleteMember = useDeleteMember();

    // null = closed, {} = adding, { id, ... } = editing that member.
    const [editing, setEditing] = useState(null);
    const [sheetFor, setSheetFor] = useState(null);

    const submitting = addMember.isPending || updateMember.isPending;

    const state = resolveViewState({
        isPending: query.isPending,
        hasData: query.data !== undefined,
        error: query.error,
    });

    // Three groups, in the order somebody reads them: themselves, the people
    // still in the group, and the people who have left but stay on old bills.
    const sections = useMemo(() => {
        const members = group?.members ?? [];
        const self = members.filter((member) => member.isCurrentUser);
        const active = members.filter((member) => !member.isCurrentUser && !member.archivedAt);
        const gone = members.filter((member) => !member.isCurrentUser && member.archivedAt);

        return [
            { key: 'you', title: t('members.you'), data: self },
            { key: 'active', title: t('members.active'), data: active },
            { key: 'archived', title: t('members.archivedSection'), data: gone },
        ].filter((section) => section.data.length > 0);
    }, [group?.members, t]);

    const runMemberAction = useCallback(
        async (action, { label, success, warn = false }) => {
            try {
                await action();
                if (warn) {
                    haptics.warning();
                } else {
                    haptics.success();
                }
                notify({ message: success });
                return true;
            } catch (error) {
                haptics.error();
                alert({ title: label, message: errorMessage(error) });
                return false;
            }
        },
        [notify, alert]
    );

    const handleSubmitEditor = async (values) => {
        const isEdit = Boolean(editing?.id);

        const ok = await runMemberAction(
            () =>
                isEdit
                    ? // isCurrentUser is never sent. The server refuses a body
                      // that mentions it at all, and the self-member's identity
                      // is not the client's to change — only their display name.
                      updateMember.mutateAsync({ groupId, memberId: editing.id, ...values })
                    : addMember.mutateAsync({ groupId, ...values }),
            {
                label: isEdit ? t('members.edit') : t('members.add'),
                success: isEdit ? t('members.saved') : t('members.added'),
            }
        );

        // Closed only on success, so a rejected duplicate name leaves the sheet
        // open with what was typed still in it.
        if (ok) {
            setEditing(null);
        }
    };

    const handleArchive = async (member) => {
        const confirmed = await confirm({
            title: t('members.archiveTitle', { name: member.name }),
            message: t('members.archiveMsg'),
            confirmLabel: t('members.archive'),
        });
        if (!confirmed) {
            return;
        }

        await runMemberAction(
            () => archiveMember.mutateAsync({ groupId, memberId: member.id }),
            { label: t('members.archive'), success: t('members.archived') }
        );
    };

    const handleUnarchive = (member) =>
        runMemberAction(() => unarchiveMember.mutateAsync({ groupId, memberId: member.id }), {
            label: t('members.unarchive'),
            success: t('members.unarchived'),
        });

    const handleDelete = async (member) => {
        const confirmed = await confirm({
            title: t('members.deleteTitle', { name: member.name }),
            message: t('members.deleteMsg'),
            confirmLabel: t('members.delete'),
            destructive: true,
        });
        if (!confirmed) {
            return;
        }

        try {
            await deleteMember.mutateAsync({ groupId, memberId: member.id });
            haptics.warning();
            notify({ message: t('members.deleted') });
        } catch (error) {
            haptics.error();

            // Somebody who appears on a bill cannot be deleted, and answering
            // only "failed" would leave the user stuck. The server says why;
            // this offers the thing to do instead.
            if (error?.response?.data?.code === 'MEMBER_HAS_HISTORY') {
                const archiveThem = await confirm({
                    title: t('members.delete'),
                    message: errorMessage(error),
                    confirmLabel: t('members.archive'),
                });
                if (archiveThem) {
                    await runMemberAction(
                        () => archiveMember.mutateAsync({ groupId, memberId: member.id }),
                        { label: t('members.archive'), success: t('members.archived') }
                    );
                }
                return;
            }

            alert({ title: t('members.delete'), message: errorMessage(error) });
        }
    };

    // Built when the sheet opens rather than per row, so a long list is not
    // carrying an options array for every member it draws.
    const sheetOptions = useMemo(() => {
        if (!sheetFor) {
            return [];
        }

        const options = [
            {
                key: 'edit',
                icon: Pencil,
                label: t('members.edit'),
                onPress: () => {
                    setSheetFor(null);
                    setEditing(sheetFor);
                },
            },
        ];

        // The self-member is the hinge the whole feature turns on: it decides
        // whose share becomes a personal expense. It can be renamed, never
        // removed. The server refuses it too — this is so the app never asks.
        if (!sheetFor.isCurrentUser) {
            options.push(
                sheetFor.archivedAt
                    ? {
                          key: 'unarchive',
                          icon: ArchiveRestore,
                          label: t('members.unarchive'),
                          onPress: () => {
                              setSheetFor(null);
                              handleUnarchive(sheetFor);
                          },
                      }
                    : {
                          key: 'archive',
                          icon: Archive,
                          label: t('members.archive'),
                          onPress: () => {
                              setSheetFor(null);
                              handleArchive(sheetFor);
                          },
                      },
                {
                    key: 'delete',
                    icon: Trash2,
                    label: t('members.delete'),
                    destructive: true,
                    onPress: () => {
                        setSheetFor(null);
                        handleDelete(sheetFor);
                    },
                }
            );
        }

        return options;
    }, [sheetFor, t]); // eslint-disable-line react-hooks/exhaustive-deps

    const renderItem = ({ item }) => {
        const isSelf = item.isCurrentUser;
        const isArchived = Boolean(item.archivedAt);

        // The whole row as one sentence, with the state said rather than shown.
        // The full name goes in the label even though the line truncates.
        const label = isSelf
            ? t('members.a11yYou', { name: item.name })
            : isArchived
              ? t('members.a11yArchived', { name: item.name })
              : item.name;

        return (
            <View style={[styles.row, isArchived && styles.rowArchived]}>
                <View style={styles.rowMain} accessible accessibilityLabel={label}>
                    <Text style={styles.rowName} numberOfLines={1}>
                        {item.name}
                    </Text>
                    {isSelf ? <Text style={styles.rowTag}>{t('members.you')}</Text> : null}
                    {item.contactNote ? (
                        <Text style={styles.rowNote} numberOfLines={1}>
                            {item.contactNote}
                        </Text>
                    ) : null}
                </View>

                {archived ? null : (
                    <TouchableOpacity
                        style={styles.rowAction}
                        onPress={() => setSheetFor(item)}
                        hitSlop={HIT_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel={t('members.a11yActions', { name: item.name })}
                    >
                        <MoreHorizontal color={colors.textMuted} size={20} />
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const header = (
        <ScreenHeader
            title={t('groups.routeMembers')}
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

    if (state === ERROR) {
        return (
            <View style={styles.container}>
                {header}
                <ErrorState error={query.error} onRetry={query.refetch} />
            </View>
        );
    }

    const onlyYou = sections.length === 1 && sections[0].key === 'you';

    return (
        <View style={styles.container}>
            {header}

            <SectionList
                sections={sections}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                renderSectionHeader={({ section }) => (
                    <Text style={styles.sectionHeader} accessibilityRole="header">
                        {section.title}
                    </Text>
                )}
                ListFooterComponent={
                    onlyYou ? (
                        <EmptyState
                            icon={UserPlus}
                            title={t('members.emptyTitle')}
                            message={t('members.emptyMsg')}
                        />
                    ) : null
                }
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                stickySectionHeadersEnabled={false}
                refreshControl={
                    <RefreshControl
                        refreshing={query.isRefetching}
                        onRefresh={query.refetch}
                        tintColor={colors.brand}
                    />
                }
            />

            {/* Nothing can be added to an archived group, so the action is not
                offered rather than offered and refused. */}
            {archived ? null : (
                <View style={styles.footer}>
                    <Button
                        title={t('members.add')}
                        onPress={() => setEditing({})}
                        icon={<UserPlus color={colors.onBrand} size={17} />}
                    />
                </View>
            )}

            <MemberEditor
                visible={editing !== null}
                member={editing?.id ? editing : null}
                onSubmit={handleSubmitEditor}
                onClose={() => setEditing(null)}
                submitting={submitting}
            />

            <ActionSheet
                visible={sheetFor !== null}
                title={sheetFor?.name}
                options={sheetOptions}
                onClose={() => setSheetFor(null)}
            />
        </View>
    );
};

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.canvas,
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
            minHeight: 56,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.m,
            paddingHorizontal: spacing.l,
            paddingVertical: spacing.m,
            marginBottom: spacing.s,
        },
        rowArchived: {
            opacity: 0.72,
            borderStyle: 'dashed',
        },
        rowMain: {
            flex: 1,
        },
        rowName: {
            fontSize: 15,
            fontWeight: '500',
            color: colors.textPrimary,
        },
        rowTag: {
            fontSize: 11,
            fontWeight: '700',
            color: colors.brand,
            marginTop: 2,
        },
        rowNote: {
            ...typography.caption,
            marginTop: 2,
        },
        rowAction: {
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: -spacing.s,
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

export default ManageGroupMembersScreen;
