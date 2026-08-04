import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import GroupForm, { MAX_GROUP_NAME, MAX_GROUP_DESCRIPTION } from '../../components/GroupForm';
import Button from '../../components/Button';
import Card from '../../components/Card';
import ErrorState from '../../components/ErrorState';
import ScreenHeader from '../../components/ScreenHeader';
import { GroupListSkeleton } from '../../components/ScreenSkeletons';
import { useFeedback } from '../../components/FeedbackProvider';
import { resolveViewState, LOADING, ERROR } from '../../utils/viewState';
import { errorMessage } from '../../utils/error';
import haptics from '../../services/haptics';
import { spacing, useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import {
    useGroup,
    useUpdateGroup,
    useArchiveGroup,
    useUnarchiveGroup,
    useDeleteGroup,
} from '../../hooks/useGroups';

// Route params: { groupId }

const EditGroupScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();
    const { confirm, notify, alert } = useFeedback();

    const groupId = route.params?.groupId;
    const query = useGroup(groupId);
    const group = query.data;

    const updateGroup = useUpdateGroup();
    const archiveGroup = useArchiveGroup();
    const unarchiveGroup = useUnarchiveGroup();
    const deleteGroup = useDeleteGroup();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState(null);
    const [nameError, setNameError] = useState('');

    // Seeded when the group arrives, and keyed on its id rather than the whole
    // object — a background refetch must not overwrite a draft the user is
    // halfway through typing.
    useEffect(() => {
        if (!group) {
            return;
        }
        setName(group.name);
        setDescription(group.description ?? '');
        setColor(group.color ?? null);
    }, [group?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const archived = Boolean(group?.archivedAt);
    const trimmed = name.trim();
    const busy =
        updateGroup.isPending ||
        archiveGroup.isPending ||
        unarchiveGroup.isPending ||
        deleteGroup.isPending;

    const state = resolveViewState({
        isPending: query.isPending,
        hasData: query.data !== undefined,
        error: query.error,
    });

    const handleSave = async () => {
        // Checked again here rather than only on the button: this is the last
        // point before a request leaves, and a disabled button is a hint.
        if (!trimmed) {
            setNameError(t('groups.nameRequired'));
            return;
        }
        if (busy) {
            return;
        }

        setNameError('');

        try {
            await updateGroup.mutateAsync({
                groupId,
                name: trimmed.slice(0, MAX_GROUP_NAME),
                description: description.trim().slice(0, MAX_GROUP_DESCRIPTION) || null,
                color: color ?? null,
            });
            haptics.success();
            notify({ message: t('groups.updated') });
            navigation.goBack();
        } catch (error) {
            haptics.error();
            alert({ title: t('groups.editGroup'), message: errorMessage(error) });
        }
    };

    const handleArchive = async () => {
        const confirmed = await confirm({
            title: t('groups.archiveTitle'),
            message: t('groups.archiveMsg'),
            confirmLabel: t('groups.archive'),
        });
        if (!confirmed) {
            return;
        }

        try {
            await archiveGroup.mutateAsync(groupId);
            // Success rather than warning: archiving loses nothing, and the
            // group can be brought back whenever.
            haptics.success();
            notify({ message: t('groups.archived') });
            navigation.goBack();
        } catch (error) {
            haptics.error();
            alert({ title: t('groups.archive'), message: errorMessage(error) });
        }
    };

    const handleUnarchive = async () => {
        if (busy) {
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

    const handleDelete = async () => {
        const confirmed = await confirm({
            title: t('groups.deleteTitle'),
            message: t('groups.deleteMsg'),
            confirmLabel: t('groups.delete'),
            destructive: true,
        });
        if (!confirmed) {
            return;
        }

        try {
            await deleteGroup.mutateAsync(groupId);
            // Warning, not success. Something irreversible just happened, and
            // buzzing happily as a group disappears reads as gloating.
            haptics.warning();
            notify({ message: t('groups.deleted') });
            navigation.navigate('Groups');
        } catch (error) {
            haptics.error();

            // A group holding expenses cannot be deleted, and answering only
            // "failed" would leave the user with nowhere to go. The server's
            // own sentence says why; this offers the thing to do instead.
            if (error?.response?.data?.code === 'GROUP_HAS_HISTORY') {
                const archiveIt = await confirm({
                    title: t('groups.delete'),
                    message: errorMessage(error),
                    confirmLabel: t('groups.archiveInstead'),
                });
                if (archiveIt) {
                    await handleArchive();
                }
                return;
            }

            alert({ title: t('groups.delete'), message: errorMessage(error) });
        }
    };

    const header = <ScreenHeader title={t('groups.routeEdit')} onBack={() => navigation.goBack()} />;

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

    const actions = (
        <View style={styles.actions}>
            {archived ? (
                <Button
                    title={t('groups.unarchive')}
                    onPress={handleUnarchive}
                    loading={unarchiveGroup.isPending}
                    disabled={busy}
                    style={styles.action}
                />
            ) : (
                <Button
                    title={t('groups.archive')}
                    onPress={handleArchive}
                    variant="secondary"
                    loading={archiveGroup.isPending}
                    disabled={busy}
                    style={styles.action}
                />
            )}

            <Button
                title={t('groups.delete')}
                onPress={handleDelete}
                variant="danger"
                loading={deleteGroup.isPending}
                disabled={busy}
                style={styles.action}
            />
        </View>
    );

    // An archived group is read-only on the server, so the form is not offered
    // at all: a save that is certain to be refused should not be reachable.
    // The metadata is still shown, because reading it is the point of keeping
    // an archived group, and unarchiving is the action that makes sense here.
    if (archived) {
        return (
            <View style={styles.container}>
                {header}
                <View style={styles.readOnly}>
                    <Card style={styles.notice}>
                        <Text style={styles.noticeText}>{t('groups.archivedNotice')}</Text>
                    </Card>

                    <Text style={styles.readOnlyName}>{group.name}</Text>
                    {group.description ? (
                        <Text style={styles.readOnlyMeta}>{group.description}</Text>
                    ) : null}

                    {actions}
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {header}

            <GroupForm
                name={name}
                onChangeName={(value) => {
                    setName(value);
                    if (nameError) {
                        setNameError('');
                    }
                }}
                description={description}
                onChangeDescription={setDescription}
                color={color}
                onChangeColor={setColor}
                nameError={nameError}
                submitLabel={t('groups.saveChanges')}
                onSubmit={handleSave}
                submitting={updateGroup.isPending}
                canSubmit={trimmed !== '' && !busy}
                footer={actions}
            />
        </View>
    );
};

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.canvas,
        },
        readOnly: {
            flex: 1,
            paddingHorizontal: spacing.l,
        },
        readOnlyName: {
            ...typography.h2,
            marginBottom: spacing.xs,
        },
        readOnlyMeta: {
            ...typography.caption,
            marginBottom: spacing.l,
        },
        actions: {
            marginTop: spacing.l,
        },
        action: {
            marginBottom: spacing.m,
        },
        notice: {
            marginBottom: spacing.l,
        },
        noticeText: {
            ...typography.caption,
        },
    });

export default EditGroupScreen;
