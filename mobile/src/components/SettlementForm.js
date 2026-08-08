import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { CalendarDays, ArrowRight } from 'lucide-react-native';

import Input from './Input';
import Button from './Button';
import Card from './Card';
import DatePickerModal from './DatePickerModal';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { formatCurrency, formatDayLabel } from '../utils/format';
import { toCentavos } from '../utils/splitMath';
import { remainingCentavos, toPeso } from '../utils/settlements';

// Backend limits, mirrored so a field cannot be filled past what will be stored.
export const MAX_METHOD = 80;
export const MAX_NOTE = 500;

// The form both settlement screens draw, so recording a payment and correcting
// one cannot drift into validating differently or wording the same three
// figures two ways.
//
// Direction is never a control. It arrives already decided — as a sentence,
// from the balance the user tapped or the payment they opened — and the form's
// job is to show it, not to offer it. Two dropdowns reading "From" and "To"
// would put the one thing this feature exists to hide back in front of the
// reader, and would let them build a payment the server will refuse.
const SettlementForm = ({
    directionText,
    outstandingCentavos,
    value,
    onChange,
    onSubmit,
    submitLabel,
    submitting,
    amountError,
    readOnly = false,
    notice,
    footNote,
    onDelete,
    deleteLabel,
    deleting,
}) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();

    const [datePicker, setDatePicker] = useState(false);

    // Recomputed only when the typed amount or the outstanding figure moves.
    const preview = useMemo(() => {
        const paying = toCentavos(value.amount) ?? 0;
        const left = remainingCentavos(outstandingCentavos, paying);

        return {
            paying,
            remaining: left,
            settles: paying > 0 && left === 0 && paying <= outstandingCentavos,
        };
    }, [value.amount, outstandingCentavos]);

    const owedText = formatCurrency(toPeso(outstandingCentavos));
    const payingText = formatCurrency(toPeso(preview.paying));
    const remainingText = formatCurrency(toPeso(preview.remaining));

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* One accessible element, one sentence. The arrow is
                    decoration beside the words, never the thing carrying the
                    meaning. */}
                <Card style={styles.directionCard}>
                    <View style={styles.direction} accessible accessibilityLabel={directionText}>
                        <View style={styles.directionIcon} importantForAccessibility="no-hide-descendants">
                            <ArrowRight color={colors.brand} size={18} />
                        </View>
                        <Text style={styles.directionText}>{directionText}</Text>
                    </View>
                </Card>

                {notice ? (
                    <View style={styles.notice} accessible accessibilityLabel={notice}>
                        <Text style={styles.noticeText}>{notice}</Text>
                    </View>
                ) : null}

                {readOnly ? null : (
                    <Input
                        label={t('settle.amountLabel')}
                        value={value.amount}
                        onChangeText={(next) => onChange({ amount: next })}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        prefix="₱"
                        error={amountError}
                    />
                )}

                {/* The whole arithmetic, spelled out. Three labelled figures
                    rather than one balance the reader has to work out, and each
                    announced with its label so none of them is a bare number. */}
                <Card style={styles.preview}>
                    <View style={styles.figure} accessible
                        accessibilityLabel={t('settle.a11yOwed', { amount: owedText })}>
                        <Text style={styles.figureLabel}>{t('settle.amountOwed')}</Text>
                        <Text style={styles.figureAmount}>{owedText}</Text>
                    </View>

                    <View style={styles.figure} accessible
                        accessibilityLabel={t('settle.a11yPaying', { amount: payingText })}>
                        <Text style={styles.figureLabel}>{t('settle.amountPaying')}</Text>
                        <Text style={styles.figureAmount}>{payingText}</Text>
                    </View>

                    {/* Polite, not assertive: this changes on every keystroke,
                        and an assertive region would interrupt the digit the
                        user is still typing. */}
                    <View
                        style={[styles.figure, styles.figureLast]}
                        accessible
                        accessibilityLiveRegion="polite"
                        accessibilityLabel={t('settle.a11yRemaining', { amount: remainingText })}
                    >
                        <Text style={styles.figureLabel}>{t('settle.remaining')}</Text>
                        <Text style={[styles.figureAmount, styles.figureStrong]}>
                            {remainingText}
                        </Text>
                    </View>

                    {preview.settles ? (
                        <Text style={styles.settles}>{t('settle.willSettle')}</Text>
                    ) : null}
                </Card>

                {readOnly ? null : (
                    <>
                        <Text style={styles.label}>{t('settle.dateLabel')}</Text>
                        <TouchableOpacity
                            style={styles.dateRow}
                            onPress={() => setDatePicker(true)}
                            activeOpacity={0.75}
                            accessibilityRole="button"
                            accessibilityLabel={formatDayLabel(value.date)}
                            accessibilityHint={t('settle.a11yChooseDate')}
                        >
                            <CalendarDays
                                color={colors.textSecondary}
                                size={16}
                                importantForAccessibility="no-hide-descendants"
                            />
                            <Text style={styles.dateText}>{formatDayLabel(value.date)}</Text>
                        </TouchableOpacity>

                        <Input
                            label={t('settle.methodLabel')}
                            value={value.method}
                            onChangeText={(next) => onChange({ method: next.slice(0, MAX_METHOD) })}
                            placeholder={t('settle.methodPlaceholder')}
                        />

                        {/* The sentence that keeps this feature honest. Nothing
                            here moves money, and a payment screen that did not
                            say so would be read as one that does. */}
                        <Text style={styles.help}>{t('settle.methodHelp')}</Text>

                        <Input
                            label={t('settle.noteLabel')}
                            value={value.note}
                            onChangeText={(next) => onChange({ note: next.slice(0, MAX_NOTE) })}
                            placeholder={t('settle.notePlaceholder')}
                            style={styles.note}
                        />
                    </>
                )}

                {footNote ? <Text style={styles.footNote}>{footNote}</Text> : null}

                {onDelete && !readOnly ? (
                    <Button
                        title={deleteLabel}
                        onPress={onDelete}
                        loading={deleting}
                        variant="danger"
                        style={styles.delete}
                    />
                ) : null}
            </ScrollView>

            {readOnly ? null : (
                <View style={styles.footer}>
                    <Button title={submitLabel} onPress={onSubmit} loading={submitting} />
                </View>
            )}

            <DatePickerModal
                visible={datePicker}
                value={value.date}
                onSelect={(date) => onChange({ date })}
                onClose={() => setDatePicker(false)}
            />
        </KeyboardAvoidingView>
    );
};

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
        container: {
            flex: 1,
        },
        content: {
            paddingHorizontal: spacing.l,
            paddingBottom: spacing.xl,
        },
        directionCard: {
            marginBottom: spacing.l,
        },
        direction: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 44,
        },
        directionIcon: {
            width: 34,
            height: 34,
            borderRadius: radius.s,
            backgroundColor: colors.brandTint,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: spacing.m,
        },
        directionText: {
            flex: 1,
            fontSize: 16,
            fontWeight: '700',
            color: colors.textPrimary,
        },
        notice: {
            paddingHorizontal: spacing.m,
            paddingVertical: spacing.s,
            borderRadius: radius.m,
            backgroundColor: colors.surfaceAlt,
            marginBottom: spacing.l,
        },
        noticeText: {
            ...typography.caption,
        },
        preview: {
            marginTop: spacing.s,
            marginBottom: spacing.l,
        },
        figure: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 44,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        figureLast: {
            borderBottomWidth: 0,
        },
        figureLabel: {
            flex: 1,
            fontSize: 14,
            color: colors.textSecondary,
        },
        figureAmount: {
            marginLeft: spacing.m,
            fontSize: 15,
            fontWeight: '600',
            color: colors.textPrimary,
            fontVariant: ['tabular-nums'],
        },
        figureStrong: {
            fontSize: 17,
            fontWeight: '700',
        },
        settles: {
            ...typography.caption,
            marginTop: spacing.s,
            color: colors.success,
        },
        label: {
            fontSize: 13,
            fontWeight: '600',
            color: colors.textSecondary,
            marginBottom: spacing.s,
        },
        dateRow: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 52,
            paddingHorizontal: spacing.l,
            borderWidth: 1.5,
            borderColor: colors.border,
            borderRadius: radius.m,
            backgroundColor: colors.surface,
            marginBottom: spacing.l,
        },
        dateText: {
            marginLeft: spacing.m,
            fontSize: 15,
            color: colors.textPrimary,
        },
        help: {
            ...typography.caption,
            marginTop: -spacing.s,
            marginBottom: spacing.l,
        },
        note: {
            marginBottom: spacing.m,
        },
        footNote: {
            ...typography.caption,
            marginTop: spacing.s,
        },
        delete: {
            marginTop: spacing.xl,
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

export default SettlementForm;
