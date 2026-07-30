import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { CalendarDays, Trash2 } from 'lucide-react-native';

import Input from '../components/Input';
import Button from '../components/Button';
import ScreenHeader from '../components/ScreenHeader';
import CategorySelect from '../components/CategorySelect';
import DatePickerModal from '../components/DatePickerModal';
import ErrorBanner from '../components/ErrorBanner';
import { useFeedback } from '../components/FeedbackProvider';
import { colors, radius, spacing } from '../theme';
import { expenseService, categoryService } from '../services/api';
import { formatCurrency, formatDate } from '../utils/format';
import { errorMessage, isHandledGlobally } from '../utils/error';

// Serves both the "Add" tab and the "EditExpense" stack route — the only
// difference is whether an existing expense arrived in the route params.
const AddExpenseScreen = ({ navigation, route }) => {
    const editing = route.params?.expense || null;

    const [amount, setAmount] = useState('');
    const [notes, setNotes] = useState('');
    const [date, setDate] = useState(new Date());
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [showPicker, setShowPicker] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    // Separate from `error`, which reports a failed save. This one reports a
    // failed category load: without it the picker just sat empty and the only
    // clue was "Pick a category" appearing after the user tried to submit.
    const [categoryError, setCategoryError] = useState(null);

    const isFocused = useIsFocused();
    const { confirm, notify } = useFeedback();

    const resetForm = useCallback(() => {
        if (editing) {
            setAmount(String(editing.amount));
            setNotes(editing.notes || '');
            setDate(new Date(editing.date));
            setSelectedCategory(editing.categoryId ?? editing.category?.id ?? null);
        } else {
            setAmount('');
            setNotes('');
            setDate(new Date());
        }
        setError('');
    }, [editing]);

    const loadCategories = useCallback(async () => {
        try {
            const res = await categoryService.getAll();
            setCategories(res.data);
            setCategoryError(null);

            // Only auto-pick when adding; editing already has its category.
            if (!editing && res.data.length > 0) {
                setSelectedCategory((current) => current ?? res.data[0].id);
            }
        } catch (err) {
            if (!isHandledGlobally(err)) {
                setCategoryError(err);
            }
        }
    }, [editing]);

    useEffect(() => {
        if (isFocused) {
            loadCategories();
        }
    }, [isFocused, loadCategories]);

    useEffect(() => {
        resetForm();
    }, [resetForm]);

    const handleSubmit = async () => {
        const parsed = parseFloat(amount);

        if (!Number.isFinite(parsed) || parsed <= 0) {
            setError('Enter an amount greater than zero.');
            return;
        }
        if (!selectedCategory) {
            setError('Pick a category.');
            return;
        }

        setError('');
        setLoading(true);

        const payload = {
            amount: parsed,
            categoryId: selectedCategory,
            date: date.toISOString(),
            notes: notes.trim(),
        };

        try {
            if (editing) {
                await expenseService.update(editing.id, payload);
                navigation.goBack();
                notify({ message: 'Changes saved' });
            } else {
                await expenseService.create(payload);
                setAmount('');
                setNotes('');
                setDate(new Date());
                navigation.navigate('Home');
                notify({ message: `${formatCurrency(parsed)} added` });
            }
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        const confirmed = await confirm({
            title: 'Delete this expense?',
            message: 'It will be removed from your records.',
            confirmLabel: 'Delete',
            destructive: true,
        });

        if (!confirmed) {
            return;
        }

        // Deleted straight away here rather than deferred: this screen closes
        // on success, so an undo window would leave the list showing a row
        // that is about to vanish. Undo lives on the Expenses list instead.
        try {
            await expenseService.delete(editing.id);
            navigation.goBack();
            notify({ message: 'Expense deleted' });
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScreenHeader
                title={editing ? 'Edit expense' : 'Add expense'}
                subtitle={editing ? 'Update the details' : 'Where did it go?'}
                onBack={editing ? () => navigation.goBack() : undefined}
            />

            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <Input
                    label="Amount"
                    placeholder="0.00"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    prefix="₱"
                />

                <Text style={styles.label}>Date</Text>
                <TouchableOpacity
                    style={styles.dateField}
                    onPress={() => setShowPicker(true)}
                    activeOpacity={0.7}
                >
                    <CalendarDays color={colors.textMuted} size={18} />
                    <Text style={styles.dateText}>{formatDate(date)}</Text>
                    <Text style={styles.dateChange}>Change</Text>
                </TouchableOpacity>

                {categoryError ? (
                    <ErrorBanner
                        error={categoryError}
                        onRetry={loadCategories}
                        style={styles.categoryError}
                    />
                ) : null}

                <CategorySelect
                    categories={categories}
                    value={selectedCategory}
                    onChange={setSelectedCategory}
                    onManage={() => navigation.navigate('Categories')}
                />

                <Input
                    label="Notes (optional)"
                    placeholder="Lunch with the team"
                    value={notes}
                    onChangeText={setNotes}
                    style={styles.notes}
                />

                {error ? (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : null}

                <Button
                    title={editing ? 'Save changes' : 'Add expense'}
                    onPress={handleSubmit}
                    loading={loading}
                />

                {editing ? (
                    <Button
                        title="Delete expense"
                        onPress={handleDelete}
                        variant="danger"
                        icon={<Trash2 color={colors.danger} size={16} />}
                        style={styles.delete}
                    />
                ) : null}
            </ScrollView>

            <DatePickerModal
                visible={showPicker}
                value={date}
                onSelect={setDate}
                onClose={() => setShowPicker(false)}
            />
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.canvas,
    },
    content: {
        padding: spacing.l,
        paddingBottom: spacing.xxxl,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textSecondary,
        marginBottom: spacing.s,
    },
    dateField: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 52,
        borderWidth: 1.5,
        borderColor: colors.border,
        borderRadius: radius.m,
        paddingHorizontal: spacing.l,
        backgroundColor: colors.surface,
        marginBottom: spacing.l,
    },
    dateText: {
        flex: 1,
        marginLeft: spacing.m,
        fontSize: 16,
        color: colors.textPrimary,
    },
    dateChange: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.brand,
    },
    notes: {
        marginTop: spacing.xs,
    },
    categoryError: {
        marginBottom: spacing.l,
    },
    errorBox: {
        backgroundColor: colors.dangerTint,
        borderRadius: radius.s,
        paddingVertical: spacing.m,
        paddingHorizontal: spacing.l,
        marginBottom: spacing.l,
    },
    errorText: {
        fontSize: 13,
        color: colors.danger,
    },
    delete: {
        marginTop: spacing.m,
    },
});

export default AddExpenseScreen;
