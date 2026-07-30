import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius, spacing, shadows } from '../theme';

// A warm hairline carries most of the separation; the shadow is only there to
// lift the card off the cream canvas, not to announce itself.
const Card = ({ children, style, padded = true, flat = false }) => (
    <View
        style={[
            styles.card,
            padded && styles.padded,
            !flat && shadows.card,
            style,
        ]}
    >
        {children}
    </View>
);

const styles = StyleSheet.create({
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
