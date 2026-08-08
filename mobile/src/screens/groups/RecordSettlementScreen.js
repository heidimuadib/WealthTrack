import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import Button from '../../components/Button';
import ErrorState from '../../components/ErrorState';
import ScreenHeader from '../../components/ScreenHeader';
import SettlementForm, { MAX_METHOD, MAX_NOTE } from '../../components/SettlementForm';
import { GroupListSkeleton } from '../../components/ScreenSkeletons';
import { useFeedback } from '../../components/FeedbackProvider';
import { resolveViewState, LOADING, ERROR } from '../../utils/viewState';
import { errorMessage } from '../../utils/error';
import { toCentavos, fromCentavos } from '../../utils/splitMath';
import { formatCurrency } from '../../utils/format';
import {
    directionKind,
    directionSentence,
    outcomeSentence,
    recordMaximumCentavos,
    remainingCentavos,
    toPeso,
} from '../../utils/settlements';
import haptics from '../../services/haptics';
import { spacing, useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import { useGroup, useGroupBalances, useCreateSettlement } from '../../hooks/useGroups';

// Route params: { groupId, fromMemberId, toMemberId }
//
// Ids only, deliberately. What is owed changes while a user walks to the ATM,
// so an amount carried in a route param would be a figure from whenever the
// previous screen last refreshed. Everything shown here is resolved from the
// balances this screen fetches for itself, which is also the figure the server
// will validate against.

const RecordSettlementScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();
    const { notify, alert } = useFeedback();

    const groupId = route.params?.groupId;
    const fromMemberId = route.params?.fromMemberId;
    const toMemberId = route.params?.toMemberId;

    const groupQuery = useGroup(groupId);
    const balancesQuery = useGroupBalances(groupId);
    const createSettlement = useCreateSettlement();

    const group = groupQuery.data;
    const balances = balancesQuery.data;
    const archived = Boolean(group?.archivedAt);

    const [draft, setDraft] = useState({ amount: '', date: new Date(), method: '', note: '' });
    const [amountError, setAmountError] = useState(null);

    const outstanding = useMemo(
        () => recordMaximumCentavos(balances, fromMemberId, toMemberId),
        [balances, fromMemberId, toMemberId]
    );

    // Seeded once, when the balances first arrive. Re-seeding on every refetch
    // would overwrite a partial amount the user had already typed.
    const seeded = useRef(false);
    useEffect(() => {
        if (seeded.current || balances === undefined || outstanding <= 0) {
            return;
        }
        seeded.current = true;
        setDraft((current) => ({ ...current, amount: fromCentavos(outstanding) }));
    }, [balances, outstanding]);

    // A ref rather than the mutation's pending flag: two taps dispatched in one
    // batch both read that flag before React re-renders either, and the group
    // ends up with the payment recorded twice.
    const submitting = useRef(false);

    const names = useMemo(() => {
        const nameOf = (memberId) =>
            (group?.members ?? []).find((member) => member.id === memberId)?.name ?? '';
        return { fromName: nameOf(fromMemberId), toName: nameOf(toMemberId) };
    }, [group, fromMemberId, toMemberId]);

    const kind = directionKind(fromMemberId, toMemberId, balances?.currentUserMemberId ?? null);

    const state = resolveViewState({
        isPending: groupQuery.isPending || balancesQuery.isPending,
        hasData: group !== undefined && balances !== undefined,
        error: groupQuery.error ?? balancesQuery.error,
    });

    const header = (
        <ScreenHeader
            title={t('groups.routeSettle')}
            subtitle={group?.name}
            onBack={() => navigation.goBack()}
        />
    );

    // The balance moved under the user between opening this screen and saving.
    // Nothing is resubmitted and nothing is quietly lowered — the fresh figure
    // is put back on screen and the decision handed back to them.
    const refreshBalances = async () => {
        const refreshed = await balancesQuery.refetch();
        return recordMaximumCentavos(refreshed.data, fromMemberId, toMemberId);
    };

    const handleServerRefusal = async (error) => {
        const code = error?.response?.data?.code;

        if (code === 'NO_BALANCE_TO_SETTLE') {
            await refreshBalances();
            return t('settle.conflictNoBalance');
        }

        if (code === 'SETTLEMENT_EXCEEDS_BALANCE') {
            // Refreshed first so the amount named in the message is the one the
            // server would accept now, not the one it just refused.
            const now = await refreshBalances();
            return t('settle.conflictExceeds', {
                amount: formatCurrency(toPeso(Math.max(now, 0))),
            });
        }

        if (code === 'SETTLEMENT_CONFLICT') {
            await refreshBalances();
            return t('settle.conflictChanged');
        }

        return errorMessage(error);
    };

    const handleSubmit = async () => {
        const paying = toCentavos(draft.amount);

        if (!paying || paying <= 0) {
            setAmountError(t('settle.amountRequired'));
            return;
        }
        if (paying > outstanding) {
            setAmountError(
                t('settle.amountTooHigh', { amount: formatCurrency(toPeso(outstanding)) })
            );
            return;
        }

        setAmountError(null);
        if (submitting.current) {
            return;
        }
        submitting.current = true;

        try {
            await createSettlement.mutateAsync({
                groupId,
                fromMemberId,
                toMemberId,
                amount: fromCentavos(paying),
                date: draft.date.toISOString(),
                method: draft.method.trim().slice(0, MAX_METHOD) || null,
                note: draft.note.trim().slice(0, MAX_NOTE) || null,
            });

            // After the server has confirmed it, never before.
            haptics.success();

            const outcome = outcomeSentence(
                kind,
                names,
                remainingCentavos(outstanding, paying),
                formatCurrency
            );
            notify({
                message: t('settle.recorded', { outcome: t(outcome.key, outcome.values) }),
            });

            navigation.goBack();
        } catch (error) {
            haptics.error();
            alert({ title: t('groups.routeSettle'), message: await handleServerRefusal(error) });
            submitting.current = false;
        }
    };

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
                <ErrorState
                    error={groupQuery.error ?? balancesQuery.error}
                    onRetry={() => {
                        groupQuery.refetch();
                        balancesQuery.refetch();
                    }}
                />
            </View>
        );
    }

    // No debt in this direction any more. Reached by a stale tap, a balance
    // settled on another device, or an expense edited in between.
    if (outstanding <= 0) {
        return (
            <View style={styles.container}>
                {header}
                <View style={styles.gone}>
                    <Text style={styles.goneTitle} accessibilityRole="header">
                        {t('settle.gone')}
                    </Text>
                    <Text style={styles.goneBody}>{t('settle.goneBody')}</Text>

                    <Button
                        title={t('settle.goneRefresh')}
                        onPress={() => balancesQuery.refetch()}
                        loading={balancesQuery.isFetching}
                        variant="secondary"
                        style={styles.goneAction}
                    />
                    <Button
                        title={t('settle.goneBack')}
                        onPress={() => navigation.goBack()}
                        style={styles.goneAction}
                    />
                </View>
            </View>
        );
    }

    const direction = directionSentence(kind, names);

    return (
        <View style={styles.container}>
            {header}

            <SettlementForm
                directionText={t(direction.key, direction.values)}
                outstandingCentavos={outstanding}
                value={draft}
                onChange={(patch) => {
                    setDraft((current) => ({ ...current, ...patch }));
                    setAmountError(null);
                }}
                onSubmit={handleSubmit}
                submitLabel={t('settle.record')}
                submitting={createSettlement.isPending}
                amountError={amountError}
                // An archived group refuses every write, so the form is shown
                // as the record it now is rather than offering a save that the
                // server would certainly reject.
                readOnly={archived}
                notice={archived ? t('settle.archivedNotice') : null}
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
        gone: {
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: spacing.xl,
        },
        goneTitle: {
            ...typography.h2,
            textAlign: 'center',
        },
        goneBody: {
            ...typography.bodyMuted,
            textAlign: 'center',
            marginTop: spacing.m,
            marginBottom: spacing.xl,
        },
        goneAction: {
            marginBottom: spacing.m,
        },
    });

export default RecordSettlementScreen;
