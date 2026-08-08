import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { HandCoins, ChevronRight } from 'lucide-react-native';

import Card from './Card';
import Button from './Button';
import { spacing, radius, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { formatCurrency, formatDayLabel } from '../utils/format';
import { directionKind, rowSentence } from '../utils/settlements';

// The payments a group has recorded, newest first.
//
// A repayment is the one thing in this feature that happened outside the app.
// The list says who paid whom in the same words the balances above use, so
// "John owes you ₱100" and "John paid you ₱40" read as two halves of one story
// rather than as a balance and a ledger entry.

// How many to draw before the section would start to dominate the screen. The
// rest are one tap away and stay on this screen — a group's payment history is
// not worth a route of its own.
const PREVIEW = 5;

// One shared empty array, so a group with no payments hands the memo below the
// same reference every render rather than a fresh literal.
const NO_SETTLEMENTS = [];

const SettlementRow = ({ settlement, currentUserMemberId, archived, onOpen, styles, colors, t }) => {
    const kind = directionKind(
        settlement.fromMember.id,
        settlement.toMember.id,
        currentUserMemberId
    );

    const names = {
        fromName: settlement.fromMember.name ?? '',
        toName: settlement.toMember.name ?? '',
    };

    const amount = formatCurrency(settlement.amount);
    const line = rowSentence(kind, names, amount);
    const sentence = t(line.key, line.values);

    // Date first, then how it was paid when that was recorded. Never the note:
    // it belongs to whoever wrote it, and a list is not where to put it.
    const meta = [formatDayLabel(settlement.date), settlement.method]
        .filter(Boolean)
        .join(' · ');

    const body = (
        <>
            <View style={styles.rowIcon} importantForAccessibility="no-hide-descendants">
                <HandCoins color={colors.brand} size={16} />
            </View>
            <View style={styles.rowMain}>
                <Text style={styles.rowSentence} numberOfLines={2}>
                    {sentence}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                    {meta}
                </Text>
            </View>
            {archived ? null : <ChevronRight color={colors.textMuted} size={16} />}
        </>
    );

    // Archived groups keep their history readable and nothing more: there is
    // no editor to open, so the row is not a button and does not pretend to be.
    if (archived) {
        return (
            <View style={styles.row} accessible accessibilityLabel={sentence}>
                {body}
            </View>
        );
    }

    return (
        <TouchableOpacity
            style={styles.row}
            onPress={() => onOpen(settlement.id)}
            activeOpacity={0.7}
            accessible
            accessibilityRole="button"
            accessibilityLabel={sentence}
            accessibilityHint={t('settle.a11yEditHint')}
        >
            {body}
        </TouchableOpacity>
    );
};

const GroupSettlements = ({
    query,
    currentUserMemberId,
    archived = false,
    onOpen,
    expensesAreKnownEmpty = false,
}) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();

    const [expanded, setExpanded] = useState(false);

    const settlements = query.data ?? NO_SETTLEMENTS;

    // Server order is kept exactly: newest by date, ties broken by when the row
    // was written. Re-sorting here would only be a second opinion about the
    // same two fields, and one that could disagree.
    const visible = useMemo(
        () => (expanded ? settlements : settlements.slice(0, PREVIEW)),
        [settlements, expanded]
    );

    // Stable across renders so a long list does not hand every row a new
    // callback each time something unrelated on the group screen changes.
    const handleOpen = useCallback((settlementId) => onOpen(settlementId), [onOpen]);

    // Nothing spent and nothing repaid: the group has no story yet, and a
    // "no payments" heading under a "no expenses" heading is just length.
    if (expensesAreKnownEmpty && settlements.length === 0 && !query.isPending && !query.error) {
        return null;
    }

    const heading = (
        <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('settle.historyTitle')}
        </Text>
    );

    // isPending, not isFetching: a refetch leaves the rows already on screen
    // where they are rather than replacing them with a placeholder.
    if (query.isPending) {
        return (
            <View>
                {heading}
                <Card padded={false}>
                    <View style={styles.state}>
                        <View style={[styles.ghost, styles.ghostWide]} />
                        <View style={[styles.ghost, styles.ghostNarrow]} />
                    </View>
                </Card>
            </View>
        );
    }

    // Section-level, with its own retry. The group, its balances and its
    // expenses all loaded; losing the payments is not a reason to take any of
    // that away.
    if (query.error && settlements.length === 0) {
        return (
            <View>
                {heading}
                <Card padded={false}>
                    <View style={styles.state}>
                        <Text style={styles.stateText}>{t('settle.loadFailed')}</Text>
                        <Button
                            title={t('errors.tryAgain')}
                            onPress={query.refetch}
                            variant="secondary"
                            size="small"
                        />
                    </View>
                </Card>
            </View>
        );
    }

    return (
        <View>
            {heading}
            <Card padded={false}>
                {settlements.length === 0 ? (
                    <View style={styles.state}>
                        <Text style={styles.stateText}>{t('settle.historyEmpty')}</Text>
                    </View>
                ) : (
                    <>
                        {visible.map((settlement, index) => (
                            <View
                                key={settlement.id}
                                style={index > 0 ? styles.divider : null}
                            >
                                <SettlementRow
                                    settlement={settlement}
                                    currentUserMemberId={currentUserMemberId}
                                    archived={archived}
                                    onOpen={handleOpen}
                                    styles={styles}
                                    colors={colors}
                                    t={t}
                                />
                            </View>
                        ))}

                        {settlements.length > PREVIEW && !expanded ? (
                            <TouchableOpacity
                                style={[styles.row, styles.divider, styles.more]}
                                onPress={() => setExpanded(true)}
                                activeOpacity={0.7}
                                accessibilityRole="button"
                                accessibilityLabel={t('settle.showAll', {
                                    count: settlements.length,
                                })}
                            >
                                <Text style={styles.moreText}>
                                    {t('settle.showAll', { count: settlements.length })}
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                    </>
                )}
            </Card>
        </View>
    );
};

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
        sectionTitle: {
            ...typography.overline,
            marginTop: spacing.xl,
            marginBottom: spacing.s,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 56,
            paddingHorizontal: spacing.l,
            paddingVertical: spacing.m,
        },
        divider: {
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
        rowIcon: {
            width: 30,
            height: 30,
            borderRadius: radius.s,
            backgroundColor: colors.brandTint,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: spacing.m,
        },
        rowMain: {
            flex: 1,
        },
        rowSentence: {
            fontSize: 15,
            fontWeight: '500',
            color: colors.textPrimary,
        },
        rowMeta: {
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 2,
        },
        more: {
            justifyContent: 'center',
        },
        moreText: {
            fontSize: 13,
            fontWeight: '600',
            color: colors.brand,
        },
        state: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: spacing.l,
        },
        stateText: {
            ...typography.caption,
            flex: 1,
        },
        ghost: {
            height: 12,
            borderRadius: radius.s,
            backgroundColor: colors.borderStrong,
            opacity: 0.5,
        },
        ghostWide: { width: '45%' },
        ghostNarrow: { width: '25%', marginLeft: spacing.m },
    });

export default GroupSettlements;
