import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { radius, spacing, useTheme } from '../theme';

// A warm hairline carries most of the separation; the shadow is only there to
// lift the card off the cream canvas, not to announce itself. In dark mode the
// shadow is dropped entirely — see createShadows — and the border does the work.
const Card = ({ children, style, padded = true, flat = false }) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    return (
        <View
            style={[
                styles.card,
                padded && styles.padded,
                !flat && theme.shadows.card,
                style,
            ]}
        >
            {children}
        </View>
    );
};

const createStyles = ({ colors }) =>
    StyleSheet.create({
        card: {
            backgroundColor: colors.surface,
            borderRadius: radius.l,
            borderWidth: 1,
            borderColor: colors.border,
        },
        padded: {
            padding: spacing.l,
        },
    });

export default Card;
