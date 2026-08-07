import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    KeyboardAvoidingView,
    Modal,
    Pressable,
    Platform,
} from 'react-native';
import { CalendarDays, Check, User } from 'lucide-react-native';

import Input from './Input';
import Button from './Button';
import Card from './Card';
import ActionSheet from './ActionSheet';
import CategoryChips from './CategoryChips';
import DatePickerModal from './DatePickerModal';
import SplitEditor from './SplitEditor';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { formatCurrency, formatDayLabel } from '../utils/format';
import {
    toCentavos,
    previewEqual,
    previewFixed,
    previewPercentage,
    previewShares,
} from '../utils/splitMath';

export const MAX_DESCRIPTION = 120;
export const MAX_NOTE = 500;

// The whole editor, shared by the add and edit screens so the two cannot drift
// into validating a bill differently. The screens own the state and decide what
// happens on save; this draws the fields and computes the preview.

// Same keys the split editor uses, so the method is named identically in the
// review as it is on the chip the user picked.
const METHOD_LABELS = {
    equal: 'split.equal',
    fixed: 'split.fixed',
    percentage: 'split.percentage',
    shares: 'split.shares',
};

const SharedExpenseForm = ({
    members,
    categories,
    value,
    onChange,
    onSubmit,
    submitLabel,
    submitting,
    errors = {},
    onManageCategories,
}) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();

    const [payerSheet, setPayerSheet] = useState(false);
    const [datePicker, setDatePicker] = useState(false);
    const [review, setReview] = useState(false);

    const nameFor = useCallback(
        (memberId) => members.find((member) => member.id === memberId)?.name ?? '',
        [members]
    );

    // Only people who can still be put on a new bill, plus anybody this expense
    // already names — an editor must be able to show the history it is editing.
    const selectable = useMemo(
        () => members.filter((m) => !m.archivedAt || value.participants.includes(m.id)),
        [members, value.participants]
    );

    const totalCentavos = toCentavos(value.amount) ?? 0;

    // Recomputed whenever the amount, the participants or the typed figures
    // change — and only then. A long list of members would otherwise reallocate
    // the whole split on every unrelated render.
    const preview = useMemo(() => {
        const entries = value.participants.map((memberId) => ({
            memberId,
            value: value.splitValues[memberId],
        }));

        if (value.method === 'equal') {
            return previewEqual(totalCentavos, value.participants);
        }
        if (value.method === 'fixed') {
            return previewFixed(totalCentavos, entries);
        }
        if (value.method === 'percentage') {
            return previewPercentage(totalCentavos, entries);
        }
        return previewShares(totalCentavos, entries);
    }, [totalCentavos, value.method, value.participants, value.splitValues]);

    const toggleParticipant = useCallback(
        (memberId) => {
            const has = value.participants.includes(memberId);
            onChange({
                participants: has
                    ? value.participants.filter((id) => id !== memberId)
                    : [...value.participants, memberId],
            });
        },
        [value.participants, onChange]
    );

    const payerOptions = useMemo(
        () =>
            selectable
                .filter((member) => !member.archivedAt || member.id === value.payerMemberId)
                .map((member) => ({
                    key: member.id,
                    icon: member.id === value.payerMemberId ? Check : User,
                    label: member.isCurrentUser ? `${member.name} (${t('members.you')})` : member.name,
                    onPress: () => {
                        setPayerSheet(false);
                        onChange({ payerMemberId: member.id });
                    },
                })),
        [selectable, value.payerMemberId, onChange, t]
    );

    const canSubmit =
        value.description.trim() !== '' &&
        totalCentavos > 0 &&
        Boolean(value.categoryId) &&
        value.participants.length > 0 &&
        preview.status.kind === 'ok' &&
        !submitting;

    // Everything the review sheet says, read straight out of the preview the
    // editor is already showing. Nothing here allocates, rounds or adjusts:
    // a review that did its own arithmetic could disagree with the rows above
    // it, and the whole point of the sheet is that it cannot.
    const shareFor = (memberId) =>
        preview.shares.find((share) => share.memberId === memberId)?.amountCentavos ?? 0;

    const self = members.find((member) => member.isCurrentUser);
    const selfOnBill = Boolean(self) && value.participants.includes(self.id);
    const selfShareCentavos = selfOnBill ? shareFor(self.id) : 0;

    // Only meaningful when the reader is the one who paid: what they put in
    // beyond their own consumption is what the group owes them back. When they
    // paid without taking part it is the whole bill, which falls out of the
    // same subtraction rather than needing a case of its own.
    const paidForOthersCentavos =
        self && value.payerMemberId === self.id ? totalCentavos - selfShareCentavos : 0;

    const participantLabel =
        value.participants.length === 1
            ? t('shared.participantsOne')
            : t('shared.participantsMany', { count: value.participants.length });

    // The button keeps the disabled state it always had, so an incomplete bill
    // never reaches the sheet. The unreachable branch is still wired to
    // onSubmit rather than dropped: the screens own the field-level messages,
    // and they must stay the one answer to a form that is not ready.
    const requestReview = () => {
        if (!canSubmit) {
            onSubmit();
            return;
        }
        setReview(true);
    };

    // Closed before the request starts, so what the user returns to on failure
    // is the editable form carrying the server's message — not a summary of a
    // bill that was never saved. Double taps are stopped where they always
    // were, by the submitting guard the screens hold.
    const confirmReview = () => {
        setReview(false);
        onSubmit();
    };

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
                <Input
                    label={t('shared.descriptionLabel')}
                    value={value.description}
                    onChangeText={(next) => onChange({ description: next })}
                    placeholder={t('shared.descriptionPlaceholder')}
                    error={errors.description}
                />

                <Input
                    label={t('shared.amountLabel')}
                    value={value.amount}
                    onChangeText={(next) => onChange({ amount: next })}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    prefix="₱"
                    error={errors.amount}
                />

                {/* The costliest field to get wrong, so it is a control of its
                    own with the answer spelled out underneath rather than a
                    dropdown among others. */}
                <Text style={styles.label}>{t('shared.paidByLabel')}</Text>
                <TouchableOpacity
                    style={styles.payer}
                    onPress={() => setPayerSheet(true)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={t('shared.a11yPayer', { name: nameFor(value.payerMemberId) })}
                    accessibilityHint={t('shared.a11yChoosePayer')}
                >
                    <User
                        color={colors.brand}
                        size={17}
                        importantForAccessibility="no-hide-descendants"
                    />
                    <Text style={styles.payerName} numberOfLines={1}>
                        {nameFor(value.payerMemberId)}
                    </Text>
                </TouchableOpacity>

                <Text style={styles.label}>{t('shared.participantsLabel')}</Text>
                <View style={styles.participants}>
                    {selectable.map((member) => {
                        const selected = value.participants.includes(member.id);
                        return (
                            <TouchableOpacity
                                key={member.id}
                                style={[styles.chip, selected && styles.chipActive]}
                                onPress={() => toggleParticipant(member.id)}
                                activeOpacity={0.75}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                accessibilityLabel={member.name}
                            >
                                {selected ? (
                                    <Check
                                        color={colors.brand}
                                        size={13}
                                        importantForAccessibility="no-hide-descendants"
                                    />
                                ) : null}
                                <Text
                                    style={[styles.chipText, selected && styles.chipTextActive]}
                                    numberOfLines={1}
                                >
                                    {member.isCurrentUser ? t('members.you') : member.name}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {errors.participants ? (
                    <Text style={styles.error}>{errors.participants}</Text>
                ) : null}

                <View style={styles.splitWrap}>
                    <SplitEditor
                        method={value.method}
                        onChangeMethod={(method) => onChange({ method })}
                        participants={value.participants}
                        values={value.splitValues}
                        onChangeValue={(memberId, next) =>
                            onChange({
                                splitValues: { ...value.splitValues, [memberId]: next },
                            })
                        }
                        preview={preview}
                        nameFor={nameFor}
                    />
                </View>

                <Text style={styles.label}>{t('shared.categoryLabel')}</Text>
                {categories.length === 0 ? (
                    <Card style={styles.emptyCategories}>
                        <Text style={styles.emptyText}>{t('shared.noCategories')}</Text>
                        <Button
                            title={t('add.createCategory')}
                            onPress={onManageCategories}
                            variant="secondary"
                            size="small"
                        />
                    </Card>
                ) : (
                    <CategoryChips
                        categories={categories}
                        value={value.categoryId}
                        onChange={(categoryId) => onChange({ categoryId })}
                    />
                )}
                {errors.category ? <Text style={styles.error}>{errors.category}</Text> : null}

                <Text style={styles.label}>{t('shared.dateLabel')}</Text>
                <TouchableOpacity
                    style={styles.dateRow}
                    onPress={() => setDatePicker(true)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={formatDayLabel(value.date)}
                >
                    <CalendarDays
                        color={colors.textSecondary}
                        size={16}
                        importantForAccessibility="no-hide-descendants"
                    />
                    <Text style={styles.dateText}>{formatDayLabel(value.date)}</Text>
                </TouchableOpacity>

                <Input
                    label={t('shared.noteLabel')}
                    value={value.note}
                    onChangeText={(next) => onChange({ note: next })}
                    placeholder={t('shared.notePlaceholder')}
                    style={styles.note}
                />
            </ScrollView>

            <View style={styles.footer}>
                {/* The whole decision in one sentence, immediately above the
                    button that commits it. */}
                {totalCentavos > 0 ? (
                    <Text style={styles.review}>
                        {t('shared.review', {
                            name: nameFor(value.payerMemberId),
                            amount: formatCurrency(totalCentavos / 100),
                        })}
                    </Text>
                ) : null}

                <Button
                    title={submitLabel}
                    onPress={requestReview}
                    loading={submitting}
                    disabled={!canSubmit}
                />
            </View>

            <ActionSheet
                visible={payerSheet}
                title={t('shared.paidByLabel')}
                options={payerOptions}
                onClose={() => setPayerSheet(false)}
            />

            <DatePickerModal
                visible={datePicker}
                value={value.date}
                onSelect={(date) => onChange({ date })}
                onClose={() => setDatePicker(false)}
            />

            {/* The whole decision, laid out once, over the form rather than
                instead of it — dismissing puts the user back on the same fields
                with the same values, because they were never left. */}
            <Modal
                visible={review}
                transparent
                animationType="fade"
                statusBarTranslucent
                onRequestClose={() => setReview(false)}
            >
                <View style={styles.backdrop}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setReview(false)} />

                    <View style={styles.sheet}>
                        <Text style={styles.sheetTitle} accessibilityRole="header">
                            {t('shared.reviewTitle')}
                        </Text>

                        <ScrollView
                            style={styles.sheetScroll}
                            contentContainerStyle={styles.sheetContent}
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={styles.factRow}>
                                <Text style={styles.factLabel}>{t('shared.reviewFor')}</Text>
                                <Text style={styles.factValue} numberOfLines={2}>
                                    {value.description.trim()}
                                </Text>
                            </View>

                            <View style={styles.factRow}>
                                <Text style={styles.factLabel}>{t('shared.reviewTotal')}</Text>
                                <Text style={[styles.factValue, styles.factTotal]}>
                                    {formatCurrency(totalCentavos / 100)}
                                </Text>
                            </View>

                            <View style={styles.factRow}>
                                <Text style={styles.factLabel}>{t('shared.paidByLabel')}</Text>
                                <Text style={styles.factValue} numberOfLines={1}>
                                    {nameFor(value.payerMemberId)}
                                </Text>
                            </View>

                            <View style={styles.factRow}>
                                <Text style={styles.factLabel}>{t('shared.reviewMethod')}</Text>
                                <Text style={styles.factValue}>{t(METHOD_LABELS[value.method])}</Text>
                            </View>

                            <View style={styles.factRow}>
                                <Text style={styles.factLabel}>{t('shared.reviewBetween')}</Text>
                                <Text style={styles.factValue}>{participantLabel}</Text>
                            </View>

                            <Text style={styles.sheetSection} accessibilityRole="header">
                                {t('shared.reviewBreakdown')}
                            </Text>

                            {/* Walked in the order the editor drew them, and
                                read out of the same preview, so the sheet and
                                the rows behind it cannot show different money. */}
                            <View style={styles.sheetShares}>
                                {value.participants.map((memberId) => {
                                    const amount = formatCurrency(shareFor(memberId) / 100);
                                    const name = nameFor(memberId);

                                    return (
                                        <View key={memberId} style={styles.shareRow}>
                                            <Text
                                                style={styles.shareName}
                                                numberOfLines={1}
                                                accessibilityLabel={t('shared.a11yShare', {
                                                    name,
                                                    amount,
                                                })}
                                            >
                                                {name}
                                            </Text>
                                            <Text style={styles.shareAmount}>{amount}</Text>
                                        </View>
                                    );
                                })}
                            </View>

                            {/* What this bill does to the reader's own money,
                                which is the one figure the group screen cannot
                                tell them and their budget will feel. */}
                            {selfOnBill ? (
                                <View style={styles.selfRow}>
                                    <Text style={styles.selfLabel}>
                                        {t('shared.reviewYourShare')}
                                    </Text>
                                    <Text style={styles.selfAmount}>
                                        {formatCurrency(selfShareCentavos / 100)}
                                    </Text>
                                </View>
                            ) : (
                                <Text style={styles.sheetNote}>{t('shared.notIncluded')}</Text>
                            )}

                            {paidForOthersCentavos > 0 ? (
                                <Text style={styles.sheetNote}>
                                    {t('shared.reviewLent', {
                                        amount: formatCurrency(paidForOthersCentavos / 100),
                                    })}
                                </Text>
                            ) : null}

                            {/* Mirrors the rule the server applies: a share of
                                nothing is not an expense, so nothing lands. */}
                            <Text style={styles.sheetNote}>
                                {selfShareCentavos > 0
                                    ? t('shared.reviewPersonal')
                                    : t('shared.reviewNoPersonal')}
                            </Text>
                        </ScrollView>

                        <View style={styles.sheetActions}>
                            <TouchableOpacity
                                style={[styles.sheetButton, styles.sheetBack]}
                                onPress={() => setReview(false)}
                                activeOpacity={0.75}
                                accessibilityRole="button"
                            >
                                <Text style={styles.sheetBackText}>{t('shared.reviewBack')}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.sheetButton, styles.sheetConfirm]}
                                onPress={confirmReview}
                                activeOpacity={0.85}
                                accessibilityRole="button"
                            >
                                <Text style={styles.sheetConfirmText}>
                                    {t('shared.reviewConfirm')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
        label: {
            fontSize: 13,
            fontWeight: '600',
            color: colors.textSecondary,
            marginBottom: spacing.s,
        },
        payer: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 52,
            paddingHorizontal: spacing.l,
            borderWidth: 1.5,
            borderColor: colors.brand,
            borderRadius: radius.m,
            backgroundColor: colors.brandTint,
            marginBottom: spacing.l,
        },
        payerName: {
            flex: 1,
            marginLeft: spacing.m,
            fontSize: 15,
            fontWeight: '700',
            color: colors.brand,
        },
        participants: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            marginBottom: spacing.m,
        },
        chip: {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 44,
            paddingHorizontal: spacing.l,
            borderRadius: radius.round,
            borderWidth: 1.5,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            marginRight: spacing.s,
            marginBottom: spacing.s,
            maxWidth: 190,
        },
        chipActive: {
            borderColor: colors.brand,
            backgroundColor: colors.brandTint,
        },
        chipText: {
            fontSize: 13,
            fontWeight: '500',
            color: colors.textSecondary,
        },
        chipTextActive: {
            marginLeft: spacing.xs,
            fontWeight: '700',
            color: colors.brand,
        },
        splitWrap: {
            marginBottom: spacing.l,
        },
        emptyCategories: {
            marginBottom: spacing.l,
        },
        emptyText: {
            ...typography.caption,
            marginBottom: spacing.m,
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
        note: {
            marginTop: spacing.s,
        },
        error: {
            fontSize: 12,
            color: colors.danger,
            marginBottom: spacing.m,
        },
        footer: {
            paddingHorizontal: spacing.l,
            paddingTop: spacing.s,
            paddingBottom: spacing.l,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.canvas,
        },
        review: {
            ...typography.caption,
            textAlign: 'center',
            marginBottom: spacing.s,
        },
        backdrop: {
            flex: 1,
            backgroundColor: colors.scrim,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing.xl,
        },
        sheet: {
            width: '100%',
            maxWidth: 380,
            // Never taller than the screen, however many people are on the
            // bill: the list inside scrolls, the actions below it do not move.
            maxHeight: '85%',
            backgroundColor: colors.surface,
            borderRadius: radius.xl,
            paddingTop: spacing.xl,
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing.l,
        },
        sheetTitle: {
            ...typography.h2,
            marginBottom: spacing.l,
        },
        sheetScroll: {
            flexShrink: 1,
        },
        sheetContent: {
            paddingBottom: spacing.s,
        },
        factRow: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            paddingVertical: spacing.s,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        factLabel: {
            width: 108,
            fontSize: 13,
            color: colors.textMuted,
        },
        factValue: {
            flex: 1,
            fontSize: 14,
            fontWeight: '600',
            color: colors.textPrimary,
            textAlign: 'right',
        },
        factTotal: {
            fontVariant: ['tabular-nums'],
        },
        sheetSection: {
            ...typography.overline,
            marginTop: spacing.l,
            marginBottom: spacing.s,
        },
        sheetShares: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.m,
            paddingHorizontal: spacing.m,
        },
        shareRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: spacing.s,
        },
        shareName: {
            flex: 1,
            fontSize: 14,
            color: colors.textSecondary,
        },
        shareAmount: {
            marginLeft: spacing.m,
            fontSize: 14,
            fontWeight: '600',
            color: colors.textPrimary,
            fontVariant: ['tabular-nums'],
        },
        selfRow: {
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: spacing.m,
            paddingVertical: spacing.m,
            paddingHorizontal: spacing.m,
            borderRadius: radius.m,
            backgroundColor: colors.brandTint,
        },
        selfLabel: {
            flex: 1,
            fontSize: 14,
            fontWeight: '700',
            color: colors.brand,
        },
        selfAmount: {
            fontSize: 15,
            fontWeight: '700',
            color: colors.brand,
            fontVariant: ['tabular-nums'],
        },
        sheetNote: {
            ...typography.caption,
            marginTop: spacing.m,
        },
        sheetActions: {
            flexDirection: 'row',
            marginTop: spacing.l,
        },
        sheetButton: {
            flex: 1,
            minHeight: 48,
            borderRadius: radius.m,
            alignItems: 'center',
            justifyContent: 'center',
            marginHorizontal: spacing.xs,
        },
        sheetBack: {
            backgroundColor: colors.surfaceAlt,
        },
        sheetBackText: {
            fontSize: 15,
            fontWeight: '600',
            color: colors.textSecondary,
        },
        sheetConfirm: {
            backgroundColor: colors.brand,
        },
        sheetConfirmText: {
            fontSize: 15,
            fontWeight: '600',
            color: colors.onBrand,
        },
    });

export default SharedExpenseForm;
