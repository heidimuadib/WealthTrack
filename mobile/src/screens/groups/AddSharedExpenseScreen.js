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
import { useGroup, useCreateSharedExpense } from '../../hooks/useGroups';
import { useCategories } from '../../hooks/useCategories';
import { useSharedExpenseDraft, emptyDraft } from './useSharedExpenseDraft';

// Route params: { groupId }

const NO_CATEGORIES = [];

const AddSharedExpenseScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();
    const { notify, alert } = useFeedback();

    const groupId = route.params?.groupId;
    const groupQuery = useGroup(groupId);
    const categoryQuery = useCategories();
    const createExpense = useCreateSharedExpense();

    const group = groupQuery.data;
    const categories = categoryQuery.data ?? NO_CATEGORIES;

    const [draft, updateDraft, setDraft] = useSharedExpenseDraft(emptyDraft());
    const [errors, setErrors] = useState({});
    const seeded = useRef(false);

    // Seeded once, when the group and the categories have both arrived. A
    // second pass would overwrite whatever the user had already typed.
    useEffect(() => {
        if (seeded.current || !group || categoryQuery.data === undefined) {
            return;
        }
        seeded.current = true;
        setDraft(emptyDraft({ members: group.members, categories }));
    }, [group, categoryQuery.data, categories, setDraft]);

    // A ref rather than the mutation's pending flag: two taps in one batch both
    // read that flag before React re-renders either of them, and the group ends
    // up with the same bill twice.
    const submitting = useRef(false);

    const state = resolveViewState({
        isPending: groupQuery.isPending || categoryQuery.isPending,
        hasData: groupQuery.data !== undefined && categoryQuery.data !== undefined,
        error: groupQuery.error,
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
            const created = await createExpense.mutateAsync({
                groupId,
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

            // After the server has confirmed it, never before.
            haptics.success();
            notify({ message: t('shared.created') });

            // replace, not navigate: Back from the detail screen should reach
            // the group, not an editor for a bill that now exists.
            navigation.replace('SharedExpenseDetail', {
                groupId,
                sharedExpenseId: created.id,
            });
        } catch (error) {
            haptics.error();
            alert({ title: t('shared.add'), message: errorMessage(error) });
            submitting.current = false;
        }
    };

    const header = (
        <ScreenHeader
            title={t('groups.routeAddExpense')}
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
                <ErrorState error={groupQuery.error} onRetry={groupQuery.refetch} />
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
                submitLabel={t('shared.save')}
                submitting={createExpense.isPending}
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

export default AddSharedExpenseScreen;
