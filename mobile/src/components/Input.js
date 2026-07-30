import React, { useState } from 'react';
import { TextInput, View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../theme';

const Input = ({
    label,
    value,
    onChangeText,
    placeholder,
    secureTextEntry,
    keyboardType,
    autoCapitalize = 'sentences',
    prefix,
    leftIcon,
    rightSlot,
    error,
    multiline = false,
    style,
}) => {
    const [focused, setFocused] = useState(false);

    return (
        <View style={[styles.container, style]}>
            {label ? <Text style={styles.label}>{label}</Text> : null}

            <View
                style={[
                    styles.field,
                    focused && styles.fieldFocused,
                    !!error && styles.fieldError,
                    multiline && styles.fieldMultiline,
                ]}
            >
                {leftIcon ? <View style={styles.leftIcon}>{leftIcon}</View> : null}
                {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
                <TextInput
                    style={[styles.input, multiline && styles.inputMultiline]}
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    secureTextEntry={secureTextEntry}
                    keyboardType={keyboardType}
                    autoCapitalize={autoCapitalize}
                    autoCorrect={false}
                    multiline={multiline}
                    placeholderTextColor={colors.textMuted}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                />
                {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: spacing.l,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textSecondary,
        marginBottom: spacing.s,
    },
    field: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 52,
        borderWidth: 1.5,
        borderColor: colors.border,
        borderRadius: radius.m,
        paddingHorizontal: spacing.l,
        backgroundColor: colors.surface,
    },
    fieldFocused: {
        borderColor: colors.brand,
        backgroundColor: colors.surface,
    },
    fieldError: {
        borderColor: colors.danger,
    },
    fieldMultiline: {
        minHeight: 92,
        alignItems: 'flex-start',
        paddingVertical: spacing.m,
    },
    prefix: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textMuted,
        marginRight: spacing.xs,
    },
    leftIcon: {
        marginRight: spacing.m,
    },
    rightSlot: {
        marginLeft: spacing.m,
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: colors.textPrimary,
        padding: 0,
    },
    inputMultiline: {
        textAlignVertical: 'top',
    },
    error: {
        fontSize: 12,
        color: colors.danger,
        marginTop: spacing.xs,
    },
});

export default Input;
