import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';

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
    editMaximumCentavos,
    outcomeSentence,
    paidSentence,
    remainingCentavos,
    toPeso,
} from '../../utils/settlements';
import haptics from '../../services/haptics';
import { useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import {
    useGroup,
    useGroupBalances,
    useSettlement,
    useUpdateSettlement,
    useDeleteSettlement,
} from '../../hooks/useGroups';

// Route params: { groupId, settlementId }
//
// Both the editor and the read-only record of a payment. An archived group
// cannot be written to, and giving that case a route of its own would mean two
// screens showing the same five facts and drifting apart over which of them is
// the truth.

const EditSettlementScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();
    const { notify, alert, confirm } = useFeedback();

    const groupId = route.params?.groupId;
    const settlementId = route.params?.settlementId;

    const groupQuery = useGroup(groupId);
    const balancesQuery = useGroupBalances(groupId);
    const settlementQuery = useSettlement(groupId, settlementId);
    const updateSettlement = useUpdateSettlement();
    const deleteSettlement = useDeleteSettlement();

    const group = groupQuery.data;
    const balances = balancesQuery.data;
    const settlement = settlementQuery.data;
    const archived = Boolean(group?.archivedAt);

    const [draft, setDraft] = useState({ amount: '', date: new Date(), method: '', note: '' });
    const [amountError, setAmountError] = useState(null);

    // Seeded once from the server's copy. The original date is preserved rather
    // than reset to today — correcting a mistyped amount must not silently move
    // when the payment happened.
    const seeded = useRef(false);
    useEffect(() => {
        if (seeded.current || !settlement) {
            return;
        }
        seeded.current = true;
        setDraft({
            amount: fromCentavos(toCentavos(settlement.amount) ?? 0),
            date: new Date(settlement.date),
            method: settlement.method ?? '',
            note: settlement.note ?? '',
        });
    }, [settlement]);

    const submitting = useRef(false);

    // The ceiling for a replacement amount, which is not the balance on screen.
    // The balances already have this payment deducted, so raising it has to be
    // measured against what would be owed with the payment removed — see
    // editMaximumCentavos, which mirrors the server's own exclusion rule.
    const maximum = useMemo(
        () => editMaximumCentavos(balances, settlement),
        [balances, settlement]
    );

    const kind = settlement
        ? directionKind(
              settlement.fromMember.id,
              settlement.toMember.id,
              balances?.currentUserMemberId ?? null
          )
        : 'thirdParty';

    const names = {
        fromName: settlement?.fromMember?.name ?? '',
        toName: settlement?.toMember?.name ?? '',
    };

    const state = resolveViewState({
        isPending: groupQuery.isPending || balancesQuery.isPending || settlementQuery.isPending,
        hasData: group !== undefined && balances !== undefined && settlement !== undefined,
        error: groupQuery.error ?? settlementQuery.error ?? balancesQuery.error,
    });

    const header = (
        <ScreenHeader
            title={t('groups.routeEditSettlement')}
            subtitle={group?.name}
            onBack={() => navigation.goBack()}
        />
    );

    const refreshBalances = async () => {
        const refreshed = await balancesQuery.refetch();
        return editMaximumCentavos(refreshed.data, settlement);
    };

    const handleServerRefusal = async (error) => {
        const code = error?.response?.data?.code;

        if (code === 'NO_BALANCE_TO_SETTLE') {
            await refreshBalances();
            return t('settle.conflictNoBalance');
        }

        if (code === 'SETTLEMENT_EXCEEDS_BALANCE') {
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
        if (paying > maximum) {
            setAmountError(t('settle.amountTooHigh', { amount: formatCurrency(toPeso(maximum)) }));
            return;
        }

        setAmountError(null);
        if (submitting.current) {
            return;
        }
        submitting.current = true;

        try {
            // Direction is never sent. The server refuses those three fields
            // outright, and the form has no way to change them.
            await updateSettlement.mutateAsync({
                groupId,
                settlementId,
                amount: fromCentavos(paying),
                date: draft.date.toISOString(),
                method: draft.method.trim().slice(0, MAX_METHOD) || null,
                note: draft.note.trim().slice(0, MAX_NOTE) || null,
            });

            haptics.success();

            const outcome = outcomeSentence(
                kind,
                names,
                remainingCentavos(maximum, paying),
                formatCurrency
            );
            notify({
                message: t('settle.updated', { outcome: t(outcome.key, outcome.values) }),
            });

            navigation.goBack();
        } catch (error) {
            haptics.error();
            alert({
                title: t('groups.routeEditSettlement'),
                message: await handleServerRefusal(error),
            });
            submitting.current = false;
        }
    };

    const handleDelete = async () => {
        if (submitting.current) {
            return;
        }

        const confirmed = await confirm({
            title: t('settle.deleteTitle'),
            // Says what this does and what it does not: the money already
            // changed hands outside the app, and removing the record reopens
            // the debt rather than reversing a transfer.
            message: t('settle.deleteBody'),
            confirmLabel: t('settle.deleteConfirm'),
            destructive: true,
        });

        if (!confirmed) {
            return;
        }

        submitting.current = true;

        try {
            await deleteSettlement.mutateAsync({ groupId, settlementId });

            // Warning, not success: a record disappearing and a balance
            // reopening is not a small triumph.
            haptics.warning();
            notify({ message: t('settle.removed') });

            navigation.goBack();
        } catch (error) {
            haptics.error();
            alert({ title: t('settle.delete'), message: errorMessage(error) });
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
                    error={groupQuery.error ?? settlementQuery.error ?? balancesQuery.error}
                    onRetry={() => {
                        groupQuery.refetch();
                        balancesQuery.refetch();
                        settlementQuery.refetch();
                    }}
                />
            </View>
        );
    }

    const direction = paidSentence(kind, names);

    return (
        <View style={styles.container}>
            {header}

            <SettlementForm
                directionText={t(direction.key, direction.values)}
                outstandingCentavos={maximum}
                value={draft}
                onChange={(patch) => {
                    setDraft((current) => ({ ...current, ...patch }));
                    setAmountError(null);
                }}
                onSubmit={handleSubmit}
                submitLabel={t('settle.save')}
                submitting={updateSettlement.isPending}
                amountError={amountError}
                // Reached after the group was archived — through a back stack
                // that outlived it, or another device. Read-only rather than a
                // form whose every write the server will refuse.
                readOnly={archived}
                notice={archived ? t('settle.archivedReadOnly') : null}
                footNote={t('settle.directionFixed')}
                onDelete={handleDelete}
                deleteLabel={t('settle.delete')}
                deleting={deleteSettlement.isPending}
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

export default EditSettlementScreen;
