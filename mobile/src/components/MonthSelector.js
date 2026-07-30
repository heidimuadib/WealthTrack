import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors, radius, spacing } from '../theme';
import { formatMonthYear, isFutureMonth, shiftMonth } from '../utils/format';

// Previously every screen was hard-wired to the current month, which made past
// months unreachable. Stepping forward past today is blocked — there is nothing
// to see there.
const MonthSelector = ({ value, onChange, tone = 'light' }) => {
    const isDark = tone === 'dark';
    const next = shiftMonth(value, 1);
    const canGoForward = !isFutureMonth(next);

    const iconColor = isDark ? colors.onBrand : colors.textPrimary;
    const disabledColor = isDark ? 'rgba(255,255,255,0.3)' : colors.borderStrong;

    return (
        <View style={[styles.container, isDark && styles.containerDark]}>
            <TouchableOpacity
                onPress={() => onChange(shiftMonth(value, -1))}
                style={styles.arrow}
                hitSlop={hitSlop}
            >
                <ChevronLeft color={iconColor} size={20} />
            </TouchableOpacity>

            <Text style={[styles.label, isDark && styles.labelDark]}>
                {formatMonthYear(value.month, value.year)}
            </Text>

            <TouchableOpacity
                onPress={() => canGoForward && onChange(next)}
                disabled={!canGoForward}
                style={styles.arrow}
                hitSlop={hitSlop}
            >
                <ChevronRight color={canGoForward ? iconColor : disabledColor} size={20} />
            </TouchableOpacity>
        </View>
    );
};

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
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
    containerDark: {
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderColor: 'rgba(255,255,255,0.18)',
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
    },
    labelDark: {
        color: colors.onBrand,
    },
});

export default MonthSelector;
