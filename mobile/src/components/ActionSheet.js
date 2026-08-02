import React, { useMemo } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';

// A list of choices from the bottom of the screen. ConfirmDialog answers a
// yes/no question in the centre; this one is for picking between three or more
// actions, where a dialog's two buttons run out.
const ActionSheet = ({ visible, title, options = [], cancelLabel, onClose }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();
    const insets = useSafeAreaInsets();

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <View style={styles.backdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

                {/* Gesture-navigation bars overlap the bottom of the screen, so
                    the sheet keeps its own clearance rather than trusting the
                    window to end where it appears to. */}
                <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.m }]}>
                    <View style={styles.grabber} />

                    {title ? <Text style={styles.title}>{title}</Text> : null}

                    {options.map((option) => {
                        const Icon = option.icon;
                        const tint = option.destructive ? colors.danger : colors.brand;

                        return (
                            <TouchableOpacity
                                key={option.key}
                                style={styles.row}
                                onPress={option.onPress}
                                activeOpacity={0.7}
                                accessibilityRole="button"
                            >
                                <View
                                    style={[
                                        styles.rowIcon,
                                        {
                                            backgroundColor: option.destructive
                                                ? colors.dangerTint
                                                : colors.brandTint,
                                        },
                                    ]}
                                >
                                    <Icon color={tint} size={18} />
                                </View>
                                <Text style={[styles.rowLabel, option.destructive && { color: tint }]}>
                                    {option.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}

                    <TouchableOpacity style={styles.cancel} onPress={onClose} activeOpacity={0.75}>
                        <Text style={styles.cancelText}>{cancelLabel || t('common.cancel')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
        backdrop: {
            flex: 1,
            backgroundColor: colors.scrim,
            justifyContent: 'flex-end',
        },
        sheet: {
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingHorizontal: spacing.l,
            paddingTop: spacing.m,
        },
        grabber: {
            alignSelf: 'center',
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.border,
            marginBottom: spacing.l,
        },
        title: {
            ...typography.overline,
            marginBottom: spacing.s,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: spacing.m,
        },
        rowIcon: {
            width: 38,
            height: 38,
            borderRadius: radius.s,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: spacing.m,
        },
        rowLabel: {
            fontSize: 15,
            fontWeight: '500',
            color: colors.textPrimary,
        },
        cancel: {
            height: 48,
            borderRadius: radius.m,
            backgroundColor: colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: spacing.m,
        },
        cancelText: {
            fontSize: 15,
            fontWeight: '600',
            color: colors.textSecondary,
        },
    });

export default ActionSheet;
