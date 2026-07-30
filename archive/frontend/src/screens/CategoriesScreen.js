import React, { useCallback, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Modal,
    Pressable,
    ScrollView,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { Plus, Tag, Pencil, Trash2 } from 'lucide-react-native';

import Input from '../components/Input';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';
import ColorPicker from '../components/ColorPicker';
import { useFeedback } from '../components/FeedbackProvider';
import { categoryPalette, colors, radius, spacing, typography } from '../theme';
import { randomCategoryColor } from '../utils/color';
import { categoryService } from '../services/api';

const CategoriesScreen = ({ navigation }) => {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [editorOpen, setEditorOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [name, setName] = useState('');
    const [color, setColor] = useState(categoryPalette[0]);
    const [error, setError] = useState('');

    const { confirm, alert, notify } = useFeedback();

    const load = useCallback(async () => {
        try {
            const res = await categoryService.getAll();
            setCategories(res.data);
        } catch (err) {
            console.warn('Failed to load categories', err?.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const openCreate = () => {
        setEditing(null);
        setName('');
        // Start from a fresh generated colour so new categories don't all
        // arrive looking the same.
        setColor(randomCategoryColor());
        setError('');
        setEditorOpen(true);
    };

    const openEdit = (category) => {
        setEditing(category);
        setName(category.name);
        setColor(category.color || categoryPalette[0]);
        setError('');
        setEditorOpen(true);
    };

    const handleSave = async () => {
        if (!name.trim()) {
            setError('Give the category a name.');
            return;
        }

        setSaving(true);
        try {
            if (editing) {
                const res = await categoryService.update(editing.id, {
                    name: name.trim(),
                    color,
                });
                setCategories((prev) =>
                    prev.map((c) => (c.id === editing.id ? res.data : c))
                );
                notify({ message: 'Category updated' });
            } else {
                const res = await categoryService.create({ name: name.trim(), color });
                setCategories((prev) =>
                    [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name))
                );
                notify({ message: `“${res.data.name}” created` });
            }
            setEditorOpen(false);
        } catch (err) {
            setError(err.response?.data?.error || 'Could not save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (category) => {
        const confirmed = await confirm({
            title: 'Delete this category?',
            message: `“${category.name}” will be removed from your list.`,
            confirmLabel: 'Delete',
            destructive: true,
        });

        if (!confirmed) {
            return;
        }

        // Deleted immediately rather than with an undo window: the API rejects
        // categories that still have expenses, and that 409 needs to be shown
        // straight away rather than five seconds later.
        try {
            await categoryService.delete(category.id);
            setCategories((prev) => prev.filter((c) => c.id !== category.id));
            notify({ message: 'Category deleted' });
        } catch (err) {
            alert({
                title: 'Still in use',
                message:
                    err.response?.data?.error ||
                    'Move or delete its expenses before removing this category.',
            });
        }
    };

    const renderItem = ({ item }) => (
        <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: item.color || colors.textMuted }]} />
            <Text style={styles.rowName} numberOfLines={1}>
                {item.name}
            </Text>

            <TouchableOpacity onPress={() => openEdit(item)} style={styles.action} hitSlop={hitSlop}>
                <Pencil color={colors.textMuted} size={17} />
            </TouchableOpacity>
            <TouchableOpacity
                onPress={() => handleDelete(item)}
                style={styles.action}
                hitSlop={hitSlop}
            >
                <Trash2 color={colors.danger} size={17} />
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={styles.container}>
            <ScreenHeader
                title="Categories"
                subtitle="Organise your spending"
                onBack={() => navigation.goBack()}
            />

            {loading ? (
                <ActivityIndicator color={colors.brand} style={styles.loading} />
            ) : (
                <FlatList
                    data={categories}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <EmptyState
                            icon={Tag}
                            title="No categories"
                            message="Add one so you can start recording expenses."
                            actionLabel="Add category"
                            onAction={openCreate}
                        />
                    }
                />
            )}

            <View style={styles.footer}>
                <Button
                    title="Add category"
                    onPress={openCreate}
                    icon={<Plus color={colors.onBrand} size={18} />}
                />
            </View>

            <Modal
                visible={editorOpen}
                transparent
                animationType="slide"
                statusBarTranslucent
                onRequestClose={() => setEditorOpen(false)}
            >
                <KeyboardAvoidingView
                    style={styles.backdrop}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <Pressable style={styles.backdropFill} onPress={() => setEditorOpen(false)} />

                    <View style={styles.sheet}>
                        <View style={styles.grabber} />
                        <Text style={styles.sheetTitle}>
                            {editing ? 'Edit category' : 'New category'}
                        </Text>

                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            <Input
                                label="Name"
                                value={name}
                                onChangeText={setName}
                                placeholder="Groceries"
                                autoCapitalize="words"
                            />

                            <ColorPicker value={color} onChange={setColor} />

                            {error ? <Text style={styles.error}>{error}</Text> : null}
                        </ScrollView>

                        <View style={styles.sheetActions}>
                            <Button
                                title={editing ? 'Save changes' : 'Create category'}
                                onPress={handleSave}
                                loading={saving}
                            />
                            <Button
                                title="Cancel"
                                onPress={() => setEditorOpen(false)}
                                variant="ghost"
                                style={styles.cancel}
                            />
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
};

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.canvas,
    },
    loading: {
        marginTop: spacing.xxl,
    },
    list: {
        paddingHorizontal: spacing.l,
        paddingBottom: spacing.l,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.m,
        paddingVertical: spacing.l,
        paddingHorizontal: spacing.l,
        marginBottom: spacing.s,
    },
    dot: {
        width: 12,
        height: 12,
        borderRadius: radius.round,
        marginRight: spacing.m,
    },
    rowName: {
        flex: 1,
        fontSize: 15,
        fontWeight: '500',
        color: colors.textPrimary,
    },
    action: {
        paddingHorizontal: spacing.s,
        marginLeft: spacing.xs,
    },
    footer: {
        padding: spacing.l,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.canvas,
    },
    backdrop: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdropFill: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(22,48,45,0.5)',
    },
    sheet: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        paddingHorizontal: spacing.xl,
        paddingBottom: spacing.xl,
        paddingTop: spacing.m,
        maxHeight: '88%',
    },
    grabber: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: radius.round,
        backgroundColor: colors.border,
        marginBottom: spacing.l,
    },
    sheetTitle: {
        ...typography.h1,
        marginBottom: spacing.l,
    },
    sheetActions: {
        paddingTop: spacing.m,
    },
    error: {
        fontSize: 13,
        color: colors.danger,
        marginBottom: spacing.m,
    },
    cancel: {
        marginTop: spacing.xs,
    },
});

export default CategoriesScreen;
