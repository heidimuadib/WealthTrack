import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { formatMonthYear, isFutureMonth, shiftMonth } from '../utils/format';

// Previously every screen was hard-wired to the current month, which made past
// months unreachable. Stepping forward past today is blocked — there is nothing
// to see there.
//
// `tone` describes the surface this sits on, not the app's colour scheme:
// "brand" is the variant used on top of the gradient balance card, where the
// treatment is the same in light and dark.
const MonthSelector = ({ value, onChange, tone = 'surface' }) => {
    const theme = useTheme();
    const { colors } = theme;
    // Subscribes this component to language changes: formatMonthYear reads the
    // active language's month names at render time.
    useLanguage();
    const styles = useMemo(() => createStyles(theme), [theme]);

    const onBrand = tone === 'brand' || tone === 'dark';
    const next = shiftMonth(value, 1);
    const canGoForward = !isFutureMonth(next);

    const iconColor = onBrand ? colors.onBrand : colors.textPrimary;
    const disabledColor = onBrand ? 'rgba(255,255,255,0.3)' : colors.borderStrong;

    return (
        <View style={[styles.container, onBrand && styles.containerOnBrand]}>
            <TouchableOpacity
                onPress={() => onChange(shiftMonth(value, -1))}
                style={styles.arrow}
                hitSlop={hitSlop}
            >
                <ChevronLeft color={iconColor} size={20} />
            </TouchableOpacity>

            <Text style={[styles.label, onBrand && styles.labelOnBrand]}>
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
        containerOnBrand: {
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
        labelOnBrand: {
            color: colors.onBrand,
        },
    });

export default MonthSelector;
