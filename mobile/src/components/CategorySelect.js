import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Pressable,
    FlatList,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { ChevronDown, Check, Search, Tag, Settings2 } from 'lucide-react-native';
import Input from './Input';
import { radius, spacing, useTheme } from '../theme';

// Wrapped chips grew a row for every few categories and pushed the save button
// down the screen. A field plus a sheet is a constant 52px no matter how many
// categories exist, and it lines up with the amount/date/notes fields.
const SEARCH_THRESHOLD = 8;

const CategorySelect = ({ label = 'Category', categories = [], value, onChange, onManage }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const selected = useMemo(
        () => categories.find((c) => c.id === value) || null,
        [categories, value]
    );

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) {
            return categories;
        }
        return categories.filter((c) => c.name.toLowerCase().includes(needle));
    }, [categories, query]);

    const close = () => {
        setOpen(false);
        setQuery('');
    };

    const pick = (category) => {
        onChange(category.id);
        close();
    };

    const renderRow = ({ item }) => {
        const active = item.id === value;
        return (
            <TouchableOpacity
                style={[styles.row, active && styles.rowActive]}
                onPress={() => pick(item)}
                activeOpacity={0.7}
            >
                <View style={[styles.dot, { backgroundColor: item.color || colors.textMuted }]} />
                <Text style={[styles.rowText, active && styles.rowTextActive]} numberOfLines={1}>
                    {item.name}
                </Text>
                {active ? <Check color={colors.brand} size={18} /> : null}
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.wrapper}>
            <Text style={styles.label}>{label}</Text>

            <TouchableOpacity
                style={styles.field}
                onPress={() => setOpen(true)}
                activeOpacity={0.7}
            >
                {selected ? (
                    <>
                        <View
                            style={[
                                styles.dot,
                                { backgroundColor: selected.color || colors.textMuted },
                            ]}
                        />
                        <Text style={styles.fieldText} numberOfLines={1}>
                            {selected.name}
                        </Text>
                    </>
                ) : (
                    <>
                        <Tag color={colors.textMuted} size={16} />
                        <Text style={[styles.fieldText, styles.placeholder]}>
                            {categories.length === 0
                                ? 'No categories yet'
                                : 'Choose a category'}
                        </Text>
                    </>
                )}
                <ChevronDown color={colors.textMuted} size={18} />
            </TouchableOpacity>

            <Modal
                visible={open}
                transparent
                animationType="slide"
                statusBarTranslucent
                onRequestClose={close}
            >
                <KeyboardAvoidingView
                    style={styles.backdrop}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <Pressable style={styles.backdropFill} onPress={close} />

                    <View style={styles.sheet}>
                        <View style={styles.grabber} />
                        <Text style={styles.sheetTitle}>Pick a category</Text>

                        {categories.length > SEARCH_THRESHOLD ? (
                            <Input
                                placeholder="Search categories"
                                value={query}
                                onChangeText={setQuery}
                                autoCapitalize="none"
                                leftIcon={<Search color={colors.textMuted} size={17} />}
                                style={styles.search}
                            />
                        ) : null}

                        <FlatList
                            data={filtered}
                            keyExtractor={(item) => String(item.id)}
                            renderItem={renderRow}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                            style={styles.list}
                            ListEmptyComponent={
                                <Text style={styles.empty}>
                                    {categories.length === 0
                                        ? 'Create a category first.'
                                        : `No category matches “${query}”.`}
                                </Text>
                            }
                        />

                        {onManage ? (
                            <TouchableOpacity
                                style={styles.manage}
                                onPress={() => {
                                    close();
                                    onManage();
                                }}
                                activeOpacity={0.7}
                            >
                                <Settings2 color={colors.brand} size={17} />
                                <Text style={styles.manageText}>Manage categories</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
};

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
    wrapper: {
        marginBottom: spacing.l,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textSecondary,
        marginBottom: spacing.s,
    },
    field: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 52,
        borderWidth: 1.5,
        borderColor: colors.border,
        borderRadius: radius.m,
        paddingHorizontal: spacing.l,
        backgroundColor: colors.surface,
    },
    fieldText: {
        flex: 1,
        marginLeft: spacing.m,
        fontSize: 16,
        color: colors.textPrimary,
    },
    placeholder: {
        color: colors.textMuted,
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: radius.round,
    },
    backdrop: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdropFill: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.scrim,
    },
    sheet: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        paddingHorizontal: spacing.xl,
        paddingTop: spacing.m,
        paddingBottom: spacing.xl,
        maxHeight: '75%',
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
        ...typography.h2,
        marginBottom: spacing.l,
    },
    search: {
        marginBottom: spacing.m,
    },
    list: {
        flexGrow: 0,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.l,
        paddingHorizontal: spacing.m,
        borderRadius: radius.m,
        marginBottom: spacing.xs,
    },
    rowActive: {
        backgroundColor: colors.brandTint,
    },
    rowText: {
        flex: 1,
        marginLeft: spacing.m,
        fontSize: 15,
        color: colors.textPrimary,
    },
    rowTextActive: {
        fontWeight: '600',
        color: colors.brand,
    },
    empty: {
        ...typography.caption,
        textAlign: 'center',
        paddingVertical: spacing.xl,
    },
    manage: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: spacing.m,
        paddingTop: spacing.l,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    manageText: {
        marginLeft: spacing.s,
        fontSize: 14,
        fontWeight: '600',
        color: colors.brand,
    },
    });

export default CategorySelect;
