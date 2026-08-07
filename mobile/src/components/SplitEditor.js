import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';

import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { formatCurrency } from '../utils/format';
import { fromScaledPercent, SPLIT_METHODS } from '../utils/splitMath';

// The four ways to divide a bill, and the running state of each.
//
// Every one of them shows resolved peso amounts as they are typed, computed by
// the same allocation the server uses — so what is on screen when Save is
// pressed is what ends up stored. Nothing is ever adjusted to make a split fit:
// a bill that is ₱5 short says so and stays unsaveable, because silently
// balancing somebody's arithmetic is how an app ends up disagreeing with the
// people using it about what they owe.

const METHOD_LABELS = {
    equal: 'split.equal',
    fixed: 'split.fixed',
    percentage: 'split.percentage',
    shares: 'split.shares',
};

// One line saying whether the split is submittable, and by how much it misses.
// Announced politely so a screen reader hears it change without the field
// losing focus mid-edit.
const StatusLine = ({ status, method, styles, t }) => {
    const text = () => {
        if (method === 'fixed') {
            if (status.kind === 'ok') {
                return t('split.fullyAssigned');
            }
            if (status.kind === 'under') {
                return t('split.leftToAssign', { amount: formatCurrency(status.centavos / 100) });
            }
            if (status.kind === 'over') {
                return t('split.overBy', { amount: formatCurrency(status.centavos / 100) });
            }
            return null;
        }

        if (method === 'percentage') {
            if (status.kind === 'ok') {
                return t('split.fullyAssigned');
            }
            if (status.kind === 'under') {
                return t('split.percentLeft', { percent: fromScaledPercent(status.scaled) });
            }
            if (status.kind === 'over') {
                return t('split.percentOver', { percent: fromScaledPercent(status.scaled) });
            }
            return t('split.percentMustTotal');
        }

        if (method === 'shares' && status.kind !== 'ok') {
            return t('split.needWeights');
        }

        return null;
    };

    const message = text();
    if (!message) {
        return null;
    }

    return (
        <Text
            style={[styles.status, status.kind === 'ok' && styles.statusOk]}
            accessibilityLiveRegion="polite"
        >
            {message}
        </Text>
    );
};

const SplitEditor = ({
    method,
    onChangeMethod,
    participants,
    values,
    onChangeValue,
    preview,
    nameFor,
}) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();

    const amountFor = (memberId) =>
        preview.shares.find((share) => share.memberId === memberId)?.amountCentavos ?? 0;

    const extra = preview.extraCentavos ?? 0;

    return (
        <View>
            <Text style={styles.label} accessibilityRole="header">
                {t('split.method')}
            </Text>

            <View style={styles.methods}>
                {SPLIT_METHODS.map((key) => {
                    const selected = method === key;
                    return (
                        <TouchableOpacity
                            key={key}
                            style={[styles.method, selected && styles.methodActive]}
                            onPress={() => onChangeMethod(key)}
                            activeOpacity={0.75}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={t(METHOD_LABELS[key])}
                        >
                            <Text style={[styles.methodText, selected && styles.methodTextActive]}>
                                {t(METHOD_LABELS[key])}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {method === 'shares' ? <Text style={styles.help}>{t('split.sharesHelp')}</Text> : null}

            <View style={styles.rows}>
                {participants.map((memberId) => {
                    const resolved = amountFor(memberId);
                    const name = nameFor(memberId);

                    return (
                        <View key={memberId} style={styles.row}>
                            {/* Name and resolved amount read as one sentence
                                rather than two fragments either side of a gap. */}
                            <Text
                                style={styles.rowName}
                                numberOfLines={1}
                                accessibilityLabel={t('shared.a11yShare', {
                                    name,
                                    amount: formatCurrency(resolved / 100),
                                })}
                            >
                                {name}
                            </Text>

                            {method === 'equal' ? null : (
                                <TextInput
                                    style={styles.input}
                                    value={String(values[memberId] ?? '')}
                                    onChangeText={(value) => onChangeValue(memberId, value)}
                                    keyboardType="decimal-pad"
                                    placeholder={method === 'shares' ? '1' : '0'}
                                    placeholderTextColor={theme.colors.textMuted}
                                    accessibilityLabel={`${name} ${t(METHOD_LABELS[method])}`}
                                />
                            )}

                            <Text style={styles.rowAmount}>{formatCurrency(resolved / 100)}</Text>
                        </View>
                    );
                })}
            </View>

            <StatusLine status={preview.status} method={method} styles={styles} t={t} />

            {/* Only when there is actually a remainder, and worded as an
                explanation rather than a warning — it is not an error, it is
                arithmetic that cannot come out even. */}
            {method === 'equal' && extra > 0 ? (
                <Text style={styles.note}>
                    {extra === 1
                        ? t('split.equalNoteOne')
                        : t('split.equalNoteMany', { count: extra })}
                </Text>
            ) : null}
        </View>
    );
};

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
        label: {
            fontSize: 13,
            fontWeight: '600',
            color: colors.textSecondary,
            marginBottom: spacing.s,
        },
        methods: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            marginBottom: spacing.m,
        },
        method: {
            minHeight: 44,
            justifyContent: 'center',
            paddingHorizontal: spacing.l,
            borderRadius: radius.round,
            borderWidth: 1.5,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            marginRight: spacing.s,
            marginBottom: spacing.s,
        },
        methodActive: {
            borderColor: colors.brand,
            backgroundColor: colors.brandTint,
        },
        methodText: {
            fontSize: 13,
            fontWeight: '500',
            color: colors.textSecondary,
        },
        methodTextActive: {
            fontWeight: '700',
            color: colors.brand,
        },
        help: {
            ...typography.caption,
            marginBottom: spacing.m,
        },
        rows: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.m,
            backgroundColor: colors.surface,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 52,
            paddingHorizontal: spacing.l,
            paddingVertical: spacing.s,
        },
        rowName: {
            flex: 1,
            fontSize: 14,
            fontWeight: '500',
            color: colors.textPrimary,
        },
        input: {
            width: 84,
            height: 40,
            marginHorizontal: spacing.s,
            paddingHorizontal: spacing.m,
            borderWidth: 1.5,
            borderColor: colors.border,
            borderRadius: radius.s,
            fontSize: 14,
            color: colors.textPrimary,
            textAlign: 'right',
        },
        rowAmount: {
            minWidth: 84,
            fontSize: 14,
            fontWeight: '600',
            color: colors.textPrimary,
            textAlign: 'right',
            fontVariant: ['tabular-nums'],
        },
        status: {
            ...typography.caption,
            marginTop: spacing.s,
        },
        statusOk: {
            color: colors.success,
            fontWeight: '600',
        },
        note: {
            ...typography.caption,
            marginTop: spacing.s,
        },
    });

export default SplitEditor;
