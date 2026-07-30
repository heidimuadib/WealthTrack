import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { radius, spacing, useTheme } from '../theme';
import { monthName } from '../utils/format';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

// A plain-JS calendar. Pulling in a native date picker would mean another
// native module and another Gradle rebuild; this needs neither and stays
// consistent with the rest of the design.
const DatePickerModal = ({ visible, value, onSelect, onClose, allowFuture = false }) => {
    const theme = useTheme();
    const { colors, typography } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);

    const initial = value ? new Date(value) : new Date();
    const [view, setView] = useState({
        month: initial.getMonth(),
        year: initial.getFullYear(),
    });

    const today = startOfDay(new Date());
    const selected = value ? startOfDay(new Date(value)) : null;
    const valueTime = value ? new Date(value).getTime() : null;

    // Re-open should land on the month of whatever is currently selected,
    // not wherever the user last browsed to.
    useEffect(() => {
        if (!visible) {
            return;
        }
        const d = valueTime ? new Date(valueTime) : new Date();
        setView({ month: d.getMonth(), year: d.getFullYear() });
    }, [visible, valueTime]);

    const firstWeekday = new Date(view.year, view.month, 1).getDay();
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();

    // Pad the grid so the 1st lands under the correct weekday column.
    const cells = [];
    for (let i = 0; i < firstWeekday; i += 1) {
        cells.push(null);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
        cells.push(day);
    }

    const stepMonth = (delta) => {
        const d = new Date(view.year, view.month + delta, 1);
        setView({ month: d.getMonth(), year: d.getFullYear() });
    };

    const handlePick = (day) => {
        const picked = new Date(view.year, view.month, day);
        if (!allowFuture && picked > today) {
            return;
        }
        onSelect(picked);
        onClose();
    };

    // Selects today directly rather than going through handlePick, which would
    // read a `view` that has not re-rendered yet.
    const handleToday = () => {
        onSelect(today);
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose}>
                {/* Swallow taps inside the sheet so they don't dismiss it. */}
                <Pressable style={styles.sheet} onPress={() => {}}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => stepMonth(-1)} hitSlop={hitSlop}>
                            <ChevronLeft color={colors.textPrimary} size={22} />
                        </TouchableOpacity>

                        <Text style={typography.h2}>
                            {monthName(view.month + 1)} {view.year}
                        </Text>

                        <TouchableOpacity onPress={() => stepMonth(1)} hitSlop={hitSlop}>
                            <ChevronRight color={colors.textPrimary} size={22} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.weekdays}>
                        {WEEKDAYS.map((day, index) => (
                            <Text key={`${day}-${index}`} style={styles.weekday}>
                                {day}
                            </Text>
                        ))}
                    </View>

                    <View style={styles.grid}>
                        {cells.map((day, index) => {
                            if (day === null) {
                                return <View key={`pad-${index}`} style={styles.cell} />;
                            }

                            const date = new Date(view.year, view.month, day);
                            const isFuture = !allowFuture && date > today;
                            const isSelected =
                                selected && date.getTime() === selected.getTime();
                            const isToday = date.getTime() === today.getTime();

                            return (
                                <TouchableOpacity
                                    key={`day-${day}`}
                                    style={styles.cell}
                                    onPress={() => handlePick(day)}
                                    disabled={isFuture}
                                    activeOpacity={0.7}
                                >
                                    <View
                                        style={[
                                            styles.dayPill,
                                            isToday && styles.dayToday,
                                            isSelected && styles.daySelected,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.dayText,
                                                isFuture && styles.dayDisabled,
                                                isSelected && styles.daySelectedText,
                                            ]}
                                        >
                                            {day}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <TouchableOpacity style={styles.todayButton} onPress={handleToday}>
                        <Text style={styles.todayText}>Jump to today</Text>
                    </TouchableOpacity>
                </Pressable>
            </Pressable>
        </Modal>
    );
};

const hitSlop = { top: 12, bottom: 12, left: 12, right: 12 };

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(22,48,45,0.45)',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
    },
    sheet: {
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        padding: spacing.l,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.l,
    },
    weekdays: {
        flexDirection: 'row',
        marginBottom: spacing.s,
    },
    weekday: {
        width: `${100 / 7}%`,
        textAlign: 'center',
        fontSize: 11,
        fontWeight: '600',
        color: colors.textMuted,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    cell: {
        width: `${100 / 7}%`,
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayPill: {
        width: 36,
        height: 36,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayToday: {
        borderWidth: 1.5,
        borderColor: colors.brandTint,
    },
    daySelected: {
        backgroundColor: colors.brand,
    },
    dayText: {
        fontSize: 14,
        color: colors.textPrimary,
    },
    daySelectedText: {
        color: colors.onBrand,
        fontWeight: '700',
    },
    dayDisabled: {
        color: colors.borderStrong,
    },
    todayButton: {
        marginTop: spacing.m,
        alignItems: 'center',
        paddingVertical: spacing.m,
    },
    todayText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.brand,
    },
    });

export default DatePickerModal;
