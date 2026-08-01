import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { radius, spacing, useTheme } from '../theme';

// MonthSelector's sibling. Stepping past the current year is blocked for the
// same reason stepping past the current month is — there is nothing there.
const YearSelector = ({ value, onChange }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);

    const canGoForward = value < new Date().getFullYear();

    return (
        <View style={styles.container}>
            <TouchableOpacity
                onPress={() => onChange(value - 1)}
                style={styles.arrow}
                hitSlop={hitSlop}
                accessibilityLabel="Previous year"
            >
                <ChevronLeft color={colors.textPrimary} size={20} />
            </TouchableOpacity>

            <Text style={styles.label}>{value}</Text>

            <TouchableOpacity
                onPress={() => canGoForward && onChange(value + 1)}
                disabled={!canGoForward}
                style={styles.arrow}
                hitSlop={hitSlop}
                accessibilityLabel="Next year"
            >
                <ChevronRight
                    color={canGoForward ? colors.textPrimary : colors.borderStrong}
                    size={20}
                />
            </TouchableOpacity>
        </View>
    );
};

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

const createStyles = ({ colors }) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.round,
            paddingHorizontal: spacing.s,
            paddingVertical: spacing.s,
        },
        arrow: {
            paddingHorizontal: spacing.s,
        },
        label: {
            flex: 1,
            textAlign: 'center',
            fontSize: 14,
            fontWeight: '600',
            color: colors.textPrimary,
            fontVariant: ['tabular-nums'],
        },
    });

export default YearSelector;
