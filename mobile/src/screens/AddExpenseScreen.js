import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
} from 'react-native';
import { CalendarDays, StickyNote, Trash2, Tag } from 'lucide-react-native';

import Input from '../components/Input';
import Button from '../components/Button';
import ScreenHeader from '../components/ScreenHeader';
import AmountKeypad from '../components/AmountKeypad';
import CategoryChips from '../components/CategoryChips';
import { CategoryChipsSkeleton } from '../components/ScreenSkeletons';
import DatePickerModal from '../components/DatePickerModal';
import ErrorBanner from '../components/ErrorBanner';
import { useFeedback } from '../components/FeedbackProvider';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { useCategories } from '../hooks/useCategories';
import { useCreateExpense, useUpdateExpense, useDeleteExpense } from '../hooks/useExpenses';
import { useRefreshOnFocus } from '../hooks/useRefreshOnFocus';
import { formatCurrency, formatDayLabel } from '../utils/format';
import { pressKey, toAmount, fromAmount, formatDisplay } from '../utils/amountInput';
import { readLastCategory, writeLastCategory } from '../utils/lastCategory';
import { errorMessage } from '../utils/error';
import haptics from '../services/haptics';

// Stable reference for the not-yet-loaded case, so the effect that picks a
// category is not re-run by a fresh [] on every render.
const NO_CATEGORIES = [];

// Serves both the "Add" tab and the "EditExpense" stack route — the only
// difference is whether an existing expense arrived in the route params.
//
// The layout answers one question first: how much? The amount is live on
// arrival with no field to focus, the category is a single tap because it is
// already set to whatever was used last, and the date and note stay out of the
// way until they are wanted. Digits plus one tap records an expense.
const AddExpenseScreen = ({ navigation, route }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();

    const editing = route.params?.expense || null;

    const [value, setValue] = useState('');
    const [notes, setNotes] = useState('');
    const [date, setDate] = useState(new Date());
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [showPicker, setShowPicker] = useState(false);
    const [showNote, setShowNote] = useState(false);
    const [noteFocused, setNoteFocused] = useState(false);
    const [error, setError] = useState('');
    // undefined until the stored preference has been read, so the first
    // category is not claimed before the remembered one has had its chance.
    const [preferred, setPreferred] = useState(undefined);

    const { confirm, notify } = useFeedback();

    const categoryQuery = useCategories();
    useRefreshOnFocus(categoryQuery);

    const createExpense = useCreateExpense();
    const updateExpense = useUpdateExpense();
    const deleteExpense = useDeleteExpense();

    const categories = categoryQuery.data ?? NO_CATEGORIES;
    // Separate from `error`, which reports a failed save. This one reports a
    // failed category load, which otherwise leaves the row silently empty.
    const categoryError = categoryQuery.error;
    const categoriesLoading = categoryQuery.isPending;
    const loading = createExpense.isPending || updateExpense.isPending;

    const amount = toAmount(value);
    const canSave = amount !== null && !!selectedCategory && !loading;

    const resetForm = useCallback(() => {
        if (editing) {
            setValue(fromAmount(Number(editing.amount)));
            setNotes(editing.notes || '');
            setShowNote(!!editing.notes);
            setDate(new Date(editing.date));
            setSelectedCategory(editing.categoryId ?? editing.category?.id ?? null);
        } else {
            setValue('');
            setNotes('');
            setShowNote(false);
            setDate(new Date());
        }
        setError('');
    }, [editing]);

    useEffect(() => {
        resetForm();
    }, [resetForm]);

    useEffect(() => {
        if (editing) {
            return;
        }
        readLastCategory().then(setPreferred);
    }, [editing]);

    // Only auto-picks when adding; editing already carries its category.
    useEffect(() => {
        if (editing || categories.length === 0 || preferred === undefined) {
            return;
        }
        setSelectedCategory((current) => {
            if (current) {
                return current;
            }
            const remembered = categories.some((c) => c.id === preferred);
            return remembered ? preferred : categories[0].id;
        });
    }, [editing, categories, preferred]);

    const handleKey = (key) => {
        setError('');
        setValue((current) => pressKey(current, key));
    };

    const handleSubmit = async () => {
        if (amount === null) {
            return;
        }
        if (!selectedCategory) {
            setError(t('add.needCategory'));
            return;
        }

        setError('');

        const payload = {
            amount,
            categoryId: selectedCategory,
            date: date.toISOString(),
            notes: notes.trim(),
        };

        try {
            if (editing) {
                await updateExpense.mutateAsync({ id: editing.id, ...payload });
                // After the server has confirmed it, never before. A buzz on
                // submit would be celebrating a save that has not happened.
                haptics.success();
                navigation.goBack();
                notify({ message: t('add.saved') });
            } else {
                await createExpense.mutateAsync(payload);
                haptics.success();
                // Remembered only once the server has accepted it, so a
                // rejected category never becomes the default.
                writeLastCategory(selectedCategory);
                setValue('');
                setNotes('');
                setShowNote(false);
                setDate(new Date());
                navigation.navigate('Home');
                notify({ message: t('add.added', { amount: formatCurrency(amount) }) });
            }
        } catch (err) {
            // The user pressed save and it did not work — that is worth
            // feeling. A background refetch failing is not.
            haptics.error();
            setError(errorMessage(err));
        }
    };

    const handleDelete = async () => {
        const confirmed = await confirm({
            title: t('add.deleteTitle'),
            message: t('add.deleteMsg'),
            confirmLabel: t('add.deleteConfirm'),
            destructive: true,
        });

        if (!confirmed) {
            return;
        }

        // Deleted straight away here rather than deferred: this screen closes
        // on success, so an undo window would leave the list showing a row
        // that is about to vanish. Undo lives on the Expenses list instead.
        try {
            await deleteExpense.mutateAsync(editing.id);
            // Warning rather than success. A deletion completing is not a
            // small triumph, and buzzing happily as somebody's record
            // disappears reads as gloating.
            haptics.warning();
            navigation.goBack();
            notify({ message: t('add.deleted') });
        } catch (err) {
            haptics.error();
            setError(errorMessage(err));
        }
    };

    const display = formatDisplay(value);
    // Already localised, and already collapses today and yesterday to words —
    // the same labels the expense list uses for its day headings.
    const dateLabel = formatDayLabel(date);

    return (
        <View style={styles.container}>
            <ScreenHeader
                title={editing ? t('add.titleEdit') : t('add.title')}
                subtitle={editing ? t('add.subtitleEdit') : t('add.subtitle')}
                onBack={editing ? () => navigation.goBack() : undefined}
            />

            <ScrollView
                style={styles.upper}
                contentContainerStyle={styles.upperContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View
                    style={styles.amountRow}
                    accessibilityLiveRegion="polite"
                    accessibilityLabel={`${t('add.amountLabel')} ${display}`}
                >
                    <Text style={styles.currency}>₱</Text>
                    <Text style={[styles.amount, value === '' && styles.amountEmpty]}>
                        {display}
                    </Text>
                </View>

                <View style={styles.metaRow}>
                    <TouchableOpacity
                        style={styles.metaChip}
                        onPress={() => setShowPicker(true)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={dateLabel}
                    >
                        <CalendarDays color={colors.textSecondary} size={15} />
                        <Text style={styles.metaText}>{dateLabel}</Text>
                    </TouchableOpacity>

                    {!showNote ? (
                        <TouchableOpacity
                            style={styles.metaChip}
                            onPress={() => setShowNote(true)}
                            activeOpacity={0.75}
                            accessibilityRole="button"
                            accessibilityLabel={t('add.addNote')}
                        >
                            <StickyNote color={colors.textSecondary} size={15} />
                            <Text style={styles.metaText}>{t('add.addNote')}</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>

                {showNote ? (
                    <View style={styles.noteWrap}>
                        <Input
                            value={notes}
                            onChangeText={setNotes}
                            placeholder={t('add.notePlaceholder')}
                            onFocus={() => setNoteFocused(true)}
                            onBlur={() => setNoteFocused(false)}
                        />
                    </View>
                ) : null}

                {categoryError ? (
                    <View style={styles.bannerWrap}>
                        <ErrorBanner error={categoryError} onRetry={categoryQuery.refetch} />
                    </View>
                ) : categoriesLoading ? (
                    <CategoryChipsSkeleton />
                ) : categories.length === 0 ? (
                    <View style={styles.categoryPlaceholder}>
                        <Tag color={colors.textMuted} size={16} />
                        <Text style={styles.emptyText}>{t('add.noCategories')}</Text>
                        <TouchableOpacity
                            onPress={() => navigation.navigate('Categories')}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                        >
                            <Text style={styles.emptyLink}>{t('add.createCategory')}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <CategoryChips
                        categories={categories}
                        value={selectedCategory}
                        onChange={(id) => {
                            setError('');
                            setSelectedCategory(id);
                        }}
                        onManage={() => navigation.navigate('Categories')}
                        manageLabel={t('add.manage')}
                    />
                )}

                {error ? (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : null}

                {editing ? (
                    <Button
                        title={t('add.delete')}
                        onPress={handleDelete}
                        variant="danger"
                        icon={<Trash2 color={colors.danger} size={16} />}
                        style={styles.delete}
                    />
                ) : null}
            </ScrollView>

            <View style={styles.footer}>
                <Button
                    title={editing ? t('add.saveEdit') : t('add.save')}
                    onPress={handleSubmit}
                    loading={loading}
                    disabled={!canSave}
                    style={styles.save}
                />

                {/* Hidden while the note has focus: the system keyboard is
                    already occupying that space, and two keyboards at once is
                    nobody's idea of quick. */}
                {!noteFocused ? (
                    <AmountKeypad
                        onKey={handleKey}
                        disabled={loading}
                        deleteLabel={t('add.keyDelete')}
                        decimalLabel={t('add.keyDecimal')}
                    />
                ) : null}
            </View>

            <DatePickerModal
                visible={showPicker}
                value={date}
                onSelect={setDate}
                onClose={() => setShowPicker(false)}
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
        upper: {
            flex: 1,
        },
        upperContent: {
            paddingBottom: spacing.l,
        },
        amountRow: {
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'center',
            paddingHorizontal: spacing.l,
            paddingTop: spacing.s,
            paddingBottom: spacing.l,
        },
        currency: {
            fontSize: 26,
            fontFamily: 'SpaceGrotesk-SemiBold',
            color: colors.textMuted,
            marginRight: 4,
        },
        amount: {
            fontSize: 52,
            fontFamily: 'SpaceGrotesk-Bold',
            letterSpacing: -1.6,
            color: colors.textPrimary,
        },
        // The zero is present so the field never looks broken, but muted so it
        // never looks like an amount that has been entered.
        amountEmpty: {
            color: colors.borderStrong,
        },
        metaRow: {
            flexDirection: 'row',
            justifyContent: 'center',
            paddingHorizontal: spacing.l,
            marginBottom: spacing.l,
        },
        metaChip: {
            flexDirection: 'row',
            alignItems: 'center',
            height: 44,
            paddingHorizontal: spacing.l,
            marginHorizontal: spacing.xs,
            borderRadius: radius.round,
            backgroundColor: colors.surfaceAlt,
        },
        metaText: {
            marginLeft: spacing.s,
            fontSize: 13,
            fontWeight: '600',
            color: colors.textSecondary,
        },
        noteWrap: {
            paddingHorizontal: spacing.l,
        },
        bannerWrap: {
            paddingHorizontal: spacing.l,
        },
        categoryPlaceholder: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 44,
            paddingHorizontal: spacing.l,
        },
        emptyText: {
            ...typography.caption,
            marginLeft: spacing.s,
            marginRight: spacing.xs,
        },
        emptyLink: {
            fontSize: 13,
            fontWeight: '700',
            color: colors.brand,
        },
        errorBox: {
            backgroundColor: colors.dangerTint,
            borderRadius: radius.s,
            paddingVertical: spacing.m,
            paddingHorizontal: spacing.l,
            marginTop: spacing.l,
            marginHorizontal: spacing.l,
        },
        errorText: {
            fontSize: 13,
            color: colors.danger,
        },
        delete: {
            marginTop: spacing.l,
            marginHorizontal: spacing.l,
        },
        footer: {
            paddingTop: spacing.s,
            paddingBottom: spacing.s,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.canvas,
        },
        save: {
            marginHorizontal: spacing.l,
            marginBottom: spacing.s,
        },
    });

export default AddExpenseScreen;
