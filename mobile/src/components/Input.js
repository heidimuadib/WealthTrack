import React, { useMemo, useState } from 'react';
import { TextInput, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { radius, spacing, useTheme } from '../theme';

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

const Input = ({
    label,
    value,
    onChangeText,
    placeholder,
    secureTextEntry,
    keyboardType,
    autoCapitalize = 'sentences',
    autoComplete,
    textContentType,
    returnKeyType,
    onSubmitEditing,
    blurOnSubmit,
    inputRef,
    prefix,
    leftIcon,
    rightSlot,
    error,
    multiline = false,
    style,
}) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);

    const [focused, setFocused] = useState(false);
    // Typing a password blind is the single biggest cause of a failed sign-in,
    // so every masked field gets a reveal toggle unless the caller has already
    // claimed the slot for something else.
    const [revealed, setRevealed] = useState(false);
    const isPassword = !!secureTextEntry;

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
                    ref={inputRef}
                    style={[styles.input, multiline && styles.inputMultiline]}
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    secureTextEntry={isPassword && !revealed}
                    keyboardType={keyboardType}
                    autoCapitalize={autoCapitalize}
                    autoComplete={autoComplete}
                    textContentType={textContentType}
                    returnKeyType={returnKeyType}
                    onSubmitEditing={onSubmitEditing}
                    blurOnSubmit={blurOnSubmit}
                    autoCorrect={false}
                    multiline={multiline}
                    placeholderTextColor={colors.textMuted}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                />

                {isPassword && !rightSlot ? (
                    <TouchableOpacity
                        onPress={() => setRevealed((current) => !current)}
                        style={styles.rightSlot}
                        hitSlop={HIT_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
                    >
                        {revealed ? (
                            <EyeOff color={colors.textMuted} size={19} />
                        ) : (
                            <Eye color={colors.textMuted} size={19} />
                        )}
                    </TouchableOpacity>
                ) : rightSlot ? (
                    <View style={styles.rightSlot}>{rightSlot}</View>
                ) : null}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
    );
};

const createStyles = ({ colors }) =>
    StyleSheet.create({
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
