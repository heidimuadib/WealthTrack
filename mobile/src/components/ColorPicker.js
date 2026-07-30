import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Check, Shuffle } from 'lucide-react-native';
import { radius, spacing, useTheme } from '../theme';
import {
    buildColorGrid,
    contrastOn,
    isValidHex,
    normaliseHex,
    randomCategoryColor,
} from '../utils/color';

const Swatch = ({ color, selected, onPress, size = 36, styles }) => (
    <TouchableOpacity
        onPress={() => onPress(color)}
        activeOpacity={0.8}
        style={[
            styles.swatch,
            { backgroundColor: color, width: size, height: size },
            selected && styles.swatchSelected,
        ]}
    >
        {selected ? <Check color={contrastOn(color)} size={size * 0.45} /> : null}
    </TouchableOpacity>
);

const ColorPicker = ({ value, onChange }) => {
    const theme = useTheme();
    const { colors, categoryPalette } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);

    const [hexDraft, setHexDraft] = useState(value || '');
    const [hexError, setHexError] = useState(false);

    // Stable across renders so swatches don't reshuffle while you're picking.
    const spectrum = useMemo(() => buildColorGrid(12), []);

    const applyColor = (color) => {
        onChange(color);
        setHexDraft(color);
        setHexError(false);
    };

    const handleShuffle = () => applyColor(randomCategoryColor());

    const handleHexChange = (text) => {
        setHexDraft(text);
        const candidate = normaliseHex(text);
        if (isValidHex(candidate)) {
            setHexError(false);
            onChange(candidate);
        } else {
            setHexError(text.length > 0);
        }
    };

    return (
        <View>
            <View style={styles.preview}>
                <View style={[styles.previewSwatch, { backgroundColor: value }]} />

                <View style={styles.previewText}>
                    <Text style={styles.previewLabel}>Selected colour</Text>
                    <TextInput
                        style={[styles.hexInput, hexError && styles.hexInputError]}
                        value={hexDraft}
                        onChangeText={handleHexChange}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={7}
                        placeholder="#0E5A54"
                        placeholderTextColor={colors.textMuted}
                    />
                </View>

                <TouchableOpacity
                    onPress={handleShuffle}
                    style={styles.shuffle}
                    activeOpacity={0.75}
                    accessibilityLabel="Generate a random colour"
                >
                    <Shuffle color={colors.brand} size={17} />
                    <Text style={styles.shuffleText}>Generate</Text>
                </TouchableOpacity>
            </View>

            <Text style={styles.groupLabel}>Suggested</Text>
            <View style={styles.row}>
                {categoryPalette.map((color) => (
                    <Swatch
                        key={color}
                        color={color}
                        selected={value === color}
                        onPress={applyColor}
                        styles={styles}
                    />
                ))}
            </View>

            <Text style={styles.groupLabel}>All colours</Text>
            <View style={styles.row}>
                {spectrum.map((color) => (
                    <Swatch
                        key={color}
                        color={color}
                        selected={value === color}
                        onPress={applyColor}
                        size={30}
                        styles={styles}
                    />
                ))}
            </View>
        </View>
    );
};

const createStyles = ({ colors }) =>
    StyleSheet.create({
    preview: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.m,
        padding: spacing.m,
        marginBottom: spacing.l,
    },
    previewSwatch: {
        width: 44,
        height: 44,
        borderRadius: radius.s,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.08)',
    },
    previewText: {
        flex: 1,
        marginLeft: spacing.m,
    },
    previewLabel: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: colors.textMuted,
        marginBottom: 2,
    },
    hexInput: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.textPrimary,
        padding: 0,
        letterSpacing: 0.5,
    },
    hexInputError: {
        color: colors.danger,
    },
    shuffle: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.brandTint,
        borderRadius: radius.round,
        paddingVertical: spacing.s,
        paddingHorizontal: spacing.m,
    },
    shuffleText: {
        marginLeft: spacing.xs,
        fontSize: 13,
        fontWeight: '700',
        color: colors.brand,
    },
    groupLabel: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: colors.textMuted,
        marginBottom: spacing.m,
    },
    row: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: spacing.l,
    },
    swatch: {
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.s,
        marginBottom: spacing.s,
    },
    swatchSelected: {
        borderWidth: 2.5,
        borderColor: colors.textPrimary,
    },
    });

export default ColorPicker;
