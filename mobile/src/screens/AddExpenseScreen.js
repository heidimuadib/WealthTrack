import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Keyboard,
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

// The two halves of the figure, once the row itself carries the whole amount
// as its label. Left focusable they would be read as "peso sign" and then a
// bare number, which is the fragmentation the row's label exists to avoid.
const AMOUNT_PARTS_HIDDEN = {
    importantForAccessibility: 'no-hide-descendants',
    accessibilityElementsHidden: true,
};

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

    // Needed to blur the note explicitly. Android can hide the keyboard while
    // leaving the field focused, and only the field itself can undo that.
    const noteRef = useRef(null);

    // The keypad is hidden while the note has focus, and onBlur is the only
    // thing that brings it back — so anything that dismisses the keyboard
    // WITHOUT blurring the field strands the screen with no keyboard and no
    // keypad, and therefore no way to enter an amount at all. On Android the
    // back button and the back gesture both do exactly that: the IME closes,
    // the TextInput keeps focus, and onBlur never fires.
    //
    // Treating a hidden keyboard as the end of the note closes that door
    // however it was opened. The blur() matters as much as the flag: without
    // it React Native still believes the field is focused, so the next tap on
    // it is a no-op and the keyboard never comes back either.
    useEffect(() => {
        const subscription = Keyboard.addListener('keyboardDidHide', () => {
            noteRef.current?.blur();
            setNoteFocused(false);
        });

        return () => subscription.remove();
    }, []);

    // Set only by the chip, so focus follows the tap that asked for the note
    // and never a note that was already on screen — an edited expense arrives
    // with its note showing, and autoFocus would open the keyboard over the
    // keypad the moment that screen appeared.
    const focusNoteOnReveal = useRef(false);

    const revealNote = useCallback(() => {
        focusNoteOnReveal.current = true;
        setShowNote(true);
    }, []);

    // The field does not exist until the render showNote triggers, so the
    // focus has to wait for it. This effect runs in the commit that mounts the
    // input, which is early enough to need no timer — and the ref is cleared
    // as it fires, so a later render that leaves showNote true cannot pull
    // focus back off the keypad.
    useEffect(() => {
        if (!showNote || !focusNoteOnReveal.current) {
            return;
        }

        focusNoteOnReveal.current = false;
        noteRef.current?.focus();
    }, [showNote]);

    // Tapping the figure is what everyone tries first once the keypad has gone,
    // and until now it did nothing at all — the row was a plain View. It only
    // ever puts the amount back within reach: the note keeps its text and its
    // place on screen, and the figure itself is not touched.
    const handleEditAmount = useCallback(() => {
        noteRef.current?.blur();
        Keyboard.dismiss();
        setNoteFocused(false);
    }, []);

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
        // The one keypad press with nothing to show for itself: a hold that
        // wipes the figure needs some sign it registered. Digits get none —
        // the number moving is confirmation enough, and a buzz per key is
        // exactly how haptics stop meaning anything.
        if (key === 'clear' && value !== '') {
            haptics.light();
        }
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

    // Says which of the two requirements is still missing, and nothing at all
    // once the form is valid. Muted rather than red: nothing has gone wrong,
    // the user simply has not finished.
    const saveHint = useMemo(() => {
        if (loading || canSave) {
            return '';
        }
        if (amount === null) {
            return t('add.hintAmount');
        }
        // Reachable whenever the row has no chip to pick: while the categories
        // are still loading, after that request fails, and on an account whose
        // categories have all been deleted.
        if (!selectedCategory) {
            return t('add.hintCategory');
        }
        return '';
    }, [loading, canSave, amount, selectedCategory, t]);

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
                <TouchableOpacity
                    style={styles.amountRow}
                    onPress={handleEditAmount}
                    activeOpacity={0.7}
                    // One element rather than three. Without `accessible` the
                    // peso sign and the figure stay separately focusable, and
                    // the row is read as two fragments instead of an amount.
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={`${t('add.amountLabel')} ₱${display}`}
                    accessibilityHint={t('add.editAmount')}
                    accessibilityLiveRegion="polite"
                >
                    <Text style={styles.currency} {...AMOUNT_PARTS_HIDDEN}>
                        ₱
                    </Text>
                    <Text
                        style={[styles.amount, value === '' && styles.amountEmpty]}
                        {...AMOUNT_PARTS_HIDDEN}
                    >
                        {display}
                    </Text>
                </TouchableOpacity>

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
                            onPress={revealNote}
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
                            inputRef={noteRef}
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
                {/* Always occupies its line, empty or not, so the keypad never
                    jumps up under a thumb the moment the first digit lands. */}
                <Text style={styles.saveHint} numberOfLines={1}>
                    {saveHint}
                </Text>

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
                        deleteHint={t('add.keyDeleteHint')}
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
            // The padding above already clears this several times over. Stated
            // anyway so the row cannot be trimmed below a usable target now
            // that it is something you tap rather than only read.
            minHeight: 44,
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
        // Muted help text, not an error: at this point nothing has failed, the
        // form is simply not finished. minHeight keeps the line reserved while
        // it is empty, which is what stops the keypad shifting when it clears.
        saveHint: {
            minHeight: 18,
            marginHorizontal: spacing.l,
            marginBottom: spacing.xs,
            textAlign: 'center',
            fontSize: 12,
            color: colors.textMuted,
        },
        save: {
            marginHorizontal: spacing.l,
            marginBottom: spacing.s,
        },
    });

export default AddExpenseScreen;
