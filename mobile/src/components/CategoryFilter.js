import React, { useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { ALL_CATEGORIES } from '../utils/expenseFilters';
import haptics from '../services/haptics';

// A filter row, not the add screen's category picker. They look similar on
// purpose and behave differently for good reasons: this one always has an
// "All" option, has no way to manage categories from it, and can be left in a
// state that matches nothing — none of which the picker can do, and all of
// which would have to be bolted onto it.
//
// It is also allowed to fail quietly. If categories cannot be loaded the row
// collapses to nothing and the expense list carries on, because browsing this
// month should not depend on a request that has nothing to do with it.
const CategoryFilter = ({ categories = [], value = ALL_CATEGORIES, onChange }) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();

    // Mirrors the selection so a repeat tap is refused immediately — `value`
    // is the parent's state and does not update until the next render, so
    // three quick taps would otherwise all read the old one and all buzz.
    const selected = useRef(value);
    selected.current = value;

    const handlePress = useCallback(
        (id) => {
            if (id === selected.current) {
                return;
            }

            selected.current = id;
            haptics.light();
            onChange(id);
        },
        [onChange]
    );

    // Nothing to filter by. Showing a row containing only "All" would be a
    // control that cannot do anything.
    if (categories.length === 0) {
        return null;
    }

    const options = [{ id: ALL_CATEGORIES, name: t('expenses.allCategories') }, ...categories];

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            keyboardShouldPersistTaps="handled"
            accessibilityLabel={t('expenses.filterLabel')}
        >
            {options.map((option) => {
                const active = option.id === value;

                return (
                    <TouchableOpacity
                        key={String(option.id)}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => handlePress(option.id)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        // Selection is announced as state rather than left to
                        // the border colour, which a screen reader cannot see
                        // and a colour-blind user may not distinguish.
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={option.name}
                    >
                        {option.color ? (
                            <View style={[styles.dot, { backgroundColor: option.color }]} />
                        ) : null}
                        <Text
                            style={[styles.chipText, active && styles.chipTextActive]}
                            numberOfLines={1}
                        >
                            {option.name}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </ScrollView>
    );
};

const createStyles = ({ colors }) =>
    StyleSheet.create({
        row: {
            paddingVertical: spacing.xs,
            paddingRight: spacing.l,
        },
        chip: {
            flexDirection: 'row',
            alignItems: 'center',
            // Comfortably past the 44pt minimum for a control this small.
            height: 44,
            paddingHorizontal: spacing.l,
            marginRight: spacing.s,
            borderRadius: radius.round,
            borderWidth: 1.5,
            borderColor: colors.border,
            backgroundColor: colors.surface,
        },
        chipActive: {
            borderColor: colors.brand,
            backgroundColor: colors.brandTint,
        },
        dot: {
            width: 8,
            height: 8,
            borderRadius: radius.round,
            marginRight: spacing.s,
        },
        chipText: {
            fontSize: 13,
            fontWeight: '500',
            color: colors.textSecondary,
            // Long category names truncate rather than stretching the row off
            // the side of the screen.
            maxWidth: 160,
        },
        chipTextActive: {
            fontWeight: '700',
            color: colors.brand,
        },
    });

export default CategoryFilter;
