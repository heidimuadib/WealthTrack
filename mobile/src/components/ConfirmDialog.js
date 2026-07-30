import React from 'react';
import { Modal, View, Text, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { AlertTriangle, Info } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../theme';

// Replaces Alert.alert so confirmations look like the rest of the app instead
// of a stock Android dialog.
const ConfirmDialog = ({
    visible,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    showCancel = true,
    onConfirm,
    onCancel,
}) => {
    const Icon = destructive ? AlertTriangle : Info;
    const accent = destructive ? colors.danger : colors.brand;
    const accentTint = destructive ? colors.dangerTint : colors.brandTint;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={onCancel}
        >
            <View style={styles.backdrop}>
                {/* Tapping outside cancels, matching the platform expectation. */}
                <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />

                <View style={styles.sheet}>
                    <View style={[styles.iconWrap, { backgroundColor: accentTint }]}>
                        <Icon color={accent} size={22} />
                    </View>

                    <Text style={styles.title}>{title}</Text>
                    {message ? <Text style={styles.message}>{message}</Text> : null}

                    <View style={styles.actions}>
                        {showCancel ? (
                            <TouchableOpacity
                                style={[styles.button, styles.cancel]}
                                onPress={onCancel}
                                activeOpacity={0.75}
                            >
                                <Text style={styles.cancelText}>{cancelLabel}</Text>
                            </TouchableOpacity>
                        ) : null}

                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: accent }]}
                            onPress={onConfirm}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.confirmText}>{confirmLabel}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(22,48,45,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
    },
    sheet: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        padding: spacing.xl,
        alignItems: 'center',
    },
    iconWrap: {
        width: 52,
        height: 52,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.l,
    },
    title: {
        ...typography.h2,
        textAlign: 'center',
        marginBottom: spacing.s,
    },
    message: {
        ...typography.caption,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: spacing.s,
    },
    actions: {
        flexDirection: 'row',
        marginTop: spacing.xl,
        width: '100%',
    },
    button: {
        flex: 1,
        height: 48,
        borderRadius: radius.m,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: spacing.xs,
    },
    cancel: {
        backgroundColor: colors.surfaceAlt,
    },
    cancelText: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    confirmText: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.onBrand,
    },
});

export default ConfirmDialog;
