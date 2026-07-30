import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, TouchableOpacity, Easing } from 'react-native';
import { colors, radius, spacing } from '../theme';

// Non-blocking feedback. Used for "saved" confirmations and, more importantly,
// for the undo window after deleting something.
const Snackbar = ({ visible, message, actionLabel, onAction }) => {
    const translateY = useRef(new Animated.Value(80)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(translateY, {
                toValue: visible ? 0 : 80,
                duration: 220,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(opacity, {
                toValue: visible ? 1 : 0,
                duration: 180,
                useNativeDriver: true,
            }),
        ]).start();
    }, [visible, translateY, opacity]);

    // Keep it mounted so the exit animation can play out.
    return (
        <Animated.View
            pointerEvents={visible ? 'box-none' : 'none'}
            style={[styles.container, { opacity, transform: [{ translateY }] }]}
        >
            <Text style={styles.message} numberOfLines={2}>
                {message}
            </Text>

            {actionLabel ? (
                <TouchableOpacity onPress={onAction} hitSlop={hitSlop} activeOpacity={0.7}>
                    <Text style={styles.action}>{actionLabel}</Text>
                </TouchableOpacity>
            ) : null}
        </Animated.View>
    );
};

const hitSlop = { top: 12, bottom: 12, left: 12, right: 12 };

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: spacing.l,
        right: spacing.l,
        // Clears the 64pt tab bar.
        bottom: 80,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.textPrimary,
        borderRadius: radius.m,
        paddingVertical: spacing.l,
        paddingHorizontal: spacing.l,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
    },
    message: {
        flex: 1,
        color: colors.surface,
        fontSize: 14,
        lineHeight: 19,
    },
    action: {
        marginLeft: spacing.l,
        color: '#7FD1C7',
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
});

export default Snackbar;
