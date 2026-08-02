import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Settings2 } from 'lucide-react-native';
import { radius, spacing, useTheme } from '../theme';

// A single scrollable row rather than a picker sheet: choosing a category is
// the one unavoidable decision when adding an expense, and a sheet turns it
// into three taps (open, pick, dismiss) instead of one. The row scrolls rather
// than wrapping so the save button never moves down the screen as categories
// are added.
const CategoryChips = ({ categories = [], value, onChange, onManage, manageLabel }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);

    const scrollRef = useRef(null);
    // id -> {x, width}, filled by each chip as it lays out.
    const chips = useRef(new Map());
    const viewport = useRef({ width: 0, offset: 0 });

    // The remembered category is often not the first one, and a chip selected
    // beyond the right edge reads as nothing being selected at all. Reading
    // the offset only at the end of a drag keeps this off the render path —
    // the position matters at the moment the selection changes, not on every
    // frame of a scroll.
    const reveal = useCallback((id) => {
        const chip = chips.current.get(id);
        const { width, offset } = viewport.current;

        if (!chip || !width) {
            return;
        }

        // Scrolls to the near edge rather than centring, so the chips before
        // the selected one stay on screen and the row keeps its context.
        const left = chip.x - spacing.l;
        const right = chip.x + chip.width + spacing.l;

        let target = null;
        if (left < offset) {
            target = Math.max(0, left);
        } else if (right > offset + width) {
            target = right - width;
        }

        // Already fully visible: leaving it alone is what stops the row
        // twitching under a thumb on every tap.
        if (target === null) {
            return;
        }

        viewport.current.offset = target;
        scrollRef.current?.scrollTo({ x: target, animated: true });
    }, []);

    // Runs when the selection changes and when categories arrive. On the very
    // first render no chip has laid out yet, so onLayout below covers that
    // case instead.
    useEffect(() => {
        reveal(value);
    }, [reveal, value, categories]);

    const handleScrollEnd = (event) => {
        viewport.current.offset = event.nativeEvent.contentOffset.x;
    };

    return (
        <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            keyboardShouldPersistTaps="handled"
            // Children lay out before their parent, so on the edit screen —
            // where the category is set on mount rather than awaited — every
            // earlier reveal ran against a zero width and did nothing. This is
            // the first point at which the row's width is known, so it is the
            // last chance to bring an already-selected chip into view.
            onLayout={(event) => {
                viewport.current.width = event.nativeEvent.layout.width;
                reveal(value);
            }}
            onScrollEndDrag={handleScrollEnd}
            onMomentumScrollEnd={handleScrollEnd}
        >
            {categories.map((category) => {
                const active = category.id === value;
                const dot = category.color || colors.textMuted;

                return (
                    <TouchableOpacity
                        key={category.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => onChange(category.id)}
                        onLayout={(event) => {
                            const { x, width } = event.nativeEvent.layout;
                            chips.current.set(category.id, { x, width });
                            if (active) {
                                reveal(category.id);
                            }
                        }}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={category.name}
                    >
                        <View style={[styles.dot, { backgroundColor: dot }]} />
                        <Text
                            style={[styles.chipText, active && styles.chipTextActive]}
                            numberOfLines={1}
                        >
                            {category.name}
                        </Text>
                    </TouchableOpacity>
                );
            })}

            {onManage ? (
                <TouchableOpacity
                    style={styles.manage}
                    onPress={onManage}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={manageLabel}
                >
                    <Settings2 color={colors.brand} size={16} />
                </TouchableOpacity>
            ) : null}
        </ScrollView>
    );
};

const createStyles = ({ colors }) =>
    StyleSheet.create({
        row: {
            paddingHorizontal: spacing.l,
            paddingVertical: spacing.xs,
        },
        chip: {
            flexDirection: 'row',
            alignItems: 'center',
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
            fontSize: 14,
            fontWeight: '500',
            color: colors.textSecondary,
            maxWidth: 150,
        },
        chipTextActive: {
            fontWeight: '700',
            color: colors.brand,
        },
        manage: {
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.round,
            borderWidth: 1.5,
            borderColor: colors.border,
            backgroundColor: colors.surface,
        },
    });

export default CategoryChips;
