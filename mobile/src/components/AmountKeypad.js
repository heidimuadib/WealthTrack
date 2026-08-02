import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Delete } from 'lucide-react-native';
import { radius, spacing, useTheme } from '../theme';

// An in-app keypad rather than the OS decimal-pad. Three reasons: the amount is
// live the moment the screen opens, so there is no tap-to-focus; the keys are
// far larger than a system keyboard's, which matters most to the people with
// the least steady hands; and the layout never shifts, because nothing slides
// up over the screen.
const KEYS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', 'del'],
];

const AmountKeypad = ({ onKey, deleteLabel, decimalLabel, disabled = false }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);

    const labelFor = (key) => {
        if (key === 'del') {
            return deleteLabel;
        }
        if (key === '.') {
            return decimalLabel;
        }
        return key;
    };

    return (
        <View style={styles.pad}>
            {KEYS.map((row) => (
                <View key={row.join('')} style={styles.row}>
                    {row.map((key) => (
                        <TouchableOpacity
                            key={key}
                            style={styles.key}
                            onPress={() => onKey(key)}
                            disabled={disabled}
                            activeOpacity={0.6}
                            accessibilityRole="button"
                            accessibilityLabel={labelFor(key)}
                        >
                            {key === 'del' ? (
                                <Delete color={colors.textSecondary} size={22} />
                            ) : (
                                <Text style={styles.keyText}>{key}</Text>
                            )}
                        </TouchableOpacity>
                    ))}
                </View>
            ))}
        </View>
    );
};

const createStyles = ({ colors }) =>
    StyleSheet.create({
        pad: {
            paddingHorizontal: spacing.s,
        },
        row: {
            flexDirection: 'row',
        },
        // Comfortably past the 44pt minimum on every phone size, because this
        // is the control the user hits most often in the whole app.
        key: {
            flex: 1,
            height: 58,
            margin: spacing.xs,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.m,
            backgroundColor: colors.surface,
        },
        keyText: {
            fontSize: 24,
            fontFamily: 'SpaceGrotesk-Medium',
            color: colors.textPrimary,
        },
    });

export default AmountKeypad;
