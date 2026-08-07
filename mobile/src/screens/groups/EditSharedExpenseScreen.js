import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';

import SharedExpenseForm, { MAX_DESCRIPTION, MAX_NOTE } from '../../components/SharedExpenseForm';
import ErrorState from '../../components/ErrorState';
import ScreenHeader from '../../components/ScreenHeader';
import { GroupListSkeleton } from '../../components/ScreenSkeletons';
import { useFeedback } from '../../components/FeedbackProvider';
import { resolveViewState, LOADING, ERROR } from '../../utils/viewState';
import { errorMessage } from '../../utils/error';
import { toCentavos, fromCentavos, buildParticipants } from '../../utils/splitMath';
import haptics from '../../services/haptics';
import { useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import { useGroup, useGroupExpenses, useUpdateSharedExpense } from '../../hooks/useGroups';
import { useCategories } from '../../hooks/useCategories';
import { useSharedExpenseDraft, draftFromExpense, emptyDraft } from './useSharedExpenseDraft';

// Route params: { groupId, sharedExpenseId }

const NO_CATEGORIES = [];

const EditSharedExpenseScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();
    const { notify, alert } = useFeedback();

    const { groupId, sharedExpenseId } = route.params ?? {};

    const groupQuery = useGroup(groupId);
    const expenseQuery = useGroupExpenses(groupId);
    const categoryQuery = useCategories();
    const updateExpense = useUpdateSharedExpense();

    const group = groupQuery.data;
    const categories = categoryQuery.data ?? NO_CATEGORIES;
    // Read from the list already in the cache rather than fetched on its own:
    // the group screen loaded it a moment ago, and one request is enough.
    const expense = (expenseQuery.data ?? []).find((row) => row.id === sharedExpenseId);

    const [draft, updateDraft, setDraft] = useSharedExpenseDraft(emptyDraft());
    const [errors, setErrors] = useState({});
    const seeded = useRef(false);
    const submitting = useRef(false);

    // Seeded exactly once. A background refetch landing mid-edit would
    // otherwise throw away what the user had changed and quietly put the
    // stored figures back under their fingers.
    useEffect(() => {
        if (seeded.current || !expense) {
            return;
        }
        seeded.current = true;
        setDraft(draftFromExpense(expense));
    }, [expense, setDraft]);

    const state = resolveViewState({
        isPending: groupQuery.isPending || expenseQuery.isPending || categoryQuery.isPending,
        hasData:
            groupQuery.data !== undefined &&
            expenseQuery.data !== undefined &&
            categoryQuery.data !== undefined,
        error: groupQuery.error || expenseQuery.error,
    });

    const handleSubmit = async () => {
        const next = {};
        if (draft.description.trim() === '') {
            next.description = t('shared.descriptionRequired');
        }
        if ((toCentavos(draft.amount) ?? 0) <= 0) {
            next.amount = t('shared.amountRequired');
        }
        if (!draft.categoryId) {
            next.category = t('shared.categoryRequired');
        }
        if (draft.participants.length === 0) {
            next.participants = t('shared.participantsRequired');
        }

        setErrors(next);
        if (Object.keys(next).length > 0 || submitting.current) {
            return;
        }

        submitting.current = true;

        try {
            await updateExpense.mutateAsync({
                groupId,
                expenseId: sharedExpenseId,
                description: draft.description.trim().slice(0, MAX_DESCRIPTION),
                amount: fromCentavos(toCentavos(draft.amount)),
                categoryId: draft.categoryId,
                date: draft.date.toISOString(),
                note: draft.note.trim().slice(0, MAX_NOTE) || null,
                payerMemberId: draft.payerMemberId,
                splitMethod: draft.method,
                participants: buildParticipants(
                    draft.method,
                    draft.participants.map((memberId) => ({
                        memberId,
                        value: draft.splitValues[memberId],
                    }))
                ),
            });

            haptics.success();
            notify({ message: t('shared.updated') });
            navigation.goBack();
        } catch (error) {
            haptics.error();
            alert({ title: t('shared.edit'), message: errorMessage(error) });
            submitting.current = false;
        }
    };

    const header = (
        <ScreenHeader
            title={t('groups.routeEditExpense')}
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

    return (
        <View style={styles.container}>
            {header}

            <SharedExpenseForm
                members={group.members}
                categories={categories}
                value={draft}
                onChange={(patch) => {
                    updateDraft(patch);
                    setErrors({});
                }}
                onSubmit={handleSubmit}
                submitLabel={t('shared.saveChanges')}
                submitting={updateExpense.isPending}
                errors={errors}
                onManageCategories={() => navigation.navigate('Categories')}
            />
        </View>
    );
};

const createStyles = ({ colors }) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.canvas,
        },
    });

export default EditSharedExpenseScreen;
