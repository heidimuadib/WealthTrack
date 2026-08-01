import React, { useEffect, useMemo, useRef } from 'react';
import {
    Animated,
    Text,
    StyleSheet,
    TouchableOpacity,
    Easing,
    PanResponder,
    Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, useTheme } from '../theme';

// Where it waits between appearances — far enough above the top edge that the
// shadow clears it too.
const HIDDEN_OFFSET = -140;

// Past these the gesture counts as "get rid of it" rather than a stray touch;
// a fast flick counts even if it never travelled that far.
const SWIPE_DISTANCE = 88;
const SWIPE_VELOCITY = 0.45;

// Non-blocking feedback. Used for "saved" confirmations and, more importantly,
// for the undo window after deleting something. It sits at the top: the tab bar
// and the keyboard both own the bottom of the screen.
const Snackbar = ({ visible, message, actionLabel, onAction, onDismiss }) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();

    const enterY = useRef(new Animated.Value(HIDDEN_OFFSET)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    // Kept apart from the entry animation so a drag and an entrance can never
    // fight over the same value.
    const dragX = useRef(new Animated.Value(0)).current;
    const dragY = useRef(new Animated.Value(0)).current;

    // PanResponder is built once, so it would otherwise close over the first
    // render's callback and dismiss the wrong toast.
    const latest = useRef({ onDismiss });
    useEffect(() => {
        latest.current.onDismiss = onDismiss;
    }, [onDismiss]);

    useEffect(() => {
        // A toast that was flung off-screen has to be brought home before the
        // next one animates in, or the next one arrives already gone.
        if (visible) {
            dragX.setValue(0);
            dragY.setValue(0);
        }

        Animated.parallel([
            Animated.timing(enterY, {
                toValue: visible ? 0 : HIDDEN_OFFSET,
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
        // `message` is a dependency so that one toast replacing another mid-
        // flight re-runs the entrance instead of inheriting a half-finished
        // swipe from the toast it replaced.
    }, [visible, message, enterY, opacity, dragX, dragY]);

    const panResponder = useMemo(
        () =>
            PanResponder.create({
                // Claimed only once the touch is clearly a drag, so a tap still
                // reaches the UNDO button underneath.
                onMoveShouldSetPanResponder: (_event, gesture) =>
                    Math.abs(gesture.dx) > 8 || gesture.dy < -8,

                onPanResponderMove: (_event, gesture) => {
                    dragX.setValue(gesture.dx);
                    // Downward goes nowhere: the toast is anchored to the top
                    // edge, so dragging it further down only detaches it.
                    dragY.setValue(Math.min(0, gesture.dy));
                },

                onPanResponderRelease: (_event, gesture) => {
                    const sideways =
                        Math.abs(gesture.dx) > SWIPE_DISTANCE ||
                        Math.abs(gesture.vx) > SWIPE_VELOCITY;
                    const upward =
                        gesture.dy < -SWIPE_DISTANCE / 2 || gesture.vy < -SWIPE_VELOCITY;

                    if (!sideways && !upward) {
                        Animated.parallel([
                            Animated.spring(dragX, {
                                toValue: 0,
                                useNativeDriver: true,
                                bounciness: 6,
                            }),
                            Animated.spring(dragY, {
                                toValue: 0,
                                useNativeDriver: true,
                                bounciness: 6,
                            }),
                        ]).start();
                        return;
                    }

                    // Carry on in the direction it was thrown rather than
                    // snapping out, so the dismissal reads as one movement.
                    const exit = sideways
                        ? Animated.timing(dragX, {
                              toValue:
                                  Math.sign(gesture.dx || gesture.vx) *
                                  Dimensions.get('window').width,
                              duration: 160,
                              useNativeDriver: true,
                          })
                        : Animated.timing(dragY, {
                              toValue: HIDDEN_OFFSET,
                              duration: 160,
                              easing: Easing.in(Easing.cubic),
                              useNativeDriver: true,
                          });

                    Animated.parallel([
                        exit,
                        Animated.timing(opacity, {
                            toValue: 0,
                            duration: 140,
                            useNativeDriver: true,
                        }),
                    ]).start(() => {
                        // Same contract as letting the timer run out: a swipe
                        // is a decision to let the pending work stand, not an
                        // undo. The provider resets `visible`, and the effect
                        // above puts the toast back at its start position.
                        latest.current.onDismiss?.();
                    });
                },

                onPanResponderTerminate: () => {
                    Animated.parallel([
                        Animated.spring(dragX, { toValue: 0, useNativeDriver: true }),
                        Animated.spring(dragY, { toValue: 0, useNativeDriver: true }),
                    ]).start();
                },
            }),
        [dragX, dragY, opacity]
    );

    // Kept mounted so the exit animation can play out.
    return (
        <Animated.View
            {...panResponder.panHandlers}
            pointerEvents={visible ? 'auto' : 'none'}
            accessibilityLiveRegion="polite"
            style={[
                styles.container,
                { top: insets.top + spacing.m },
                {
                    opacity,
                    transform: [
                        { translateX: dragX },
                        { translateY: Animated.add(enterY, dragY) },
                    ],
                },
            ]}
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

const createStyles = ({ colors }) =>
    StyleSheet.create({
        container: {
            position: 'absolute',
            left: spacing.l,
            right: spacing.l,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.snackbarSurface,
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
            color: colors.snackbarText,
            fontSize: 14,
            lineHeight: 19,
        },
        action: {
            marginLeft: spacing.l,
            color: colors.snackbarAction,
            fontSize: 14,
            fontWeight: '700',
            letterSpacing: 0.3,
        },
    });

export default Snackbar;
