import React, { forwardRef, useMemo } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Trash2 } from 'lucide-react-native';

import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';

// Swipe left to reveal a delete action, which then has to be tapped.
//
// The tap is the point. A gesture that deletes the moment it passes a
// threshold turns a mis-scroll into lost data, and this list is somebody's
// financial record. Revealing and then pressing is two deliberate movements,
// and the undo window behind it is a third safety net — which is also why the
// swipe path skips the confirmation dialog the long-press path keeps.
//
// gesture-handler's own Swipeable, which is already installed for the
// navigator and, at 2.9, animates with React Native's Animated rather than
// Reanimated — so this adds no dependency at all.
const ACTION_WIDTH = 88;

const SwipeableRow = forwardRef(
    ({ children, onDelete, onSwipeOpen, accessibilityLabel }, ref) => {
        const theme = useTheme();
        const { colors } = theme;
        const styles = useMemo(() => createStyles(theme), [theme]);
        const { t } = useLanguage();

        // Tracks the drag so the icon and label arrive with the panel rather
        // than sitting fully formed behind a row that has barely moved.
        const renderAction = (progress) => {
            const scale = progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0.7, 1],
                extrapolate: 'clamp',
            });

            return (
                <TouchableOpacity
                    style={styles.action}
                    onPress={onDelete}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={accessibilityLabel || t('expenses.deleteAction')}
                >
                    <Animated.View style={{ transform: [{ scale }] }}>
                        <Trash2 color={colors.onDanger} size={19} />
                        <Text style={styles.actionText}>{t('expenses.deleteAction')}</Text>
                    </Animated.View>
                </TouchableOpacity>
            );
        };

        return (
            <Swipeable
                ref={ref}
                renderRightActions={renderAction}
                onSwipeableWillOpen={onSwipeOpen}
                // Far enough that a lazy horizontal wobble during a vertical
                // scroll never opens anything.
                rightThreshold={ACTION_WIDTH / 2}
                friction={2}
                overshootRight={false}
                // No onSwipeableOpen-to-delete anywhere: passing a threshold is
                // not a decision, and this list is not somewhere to guess.
                containerStyle={styles.container}
            >
                {children}
            </Swipeable>
        );
    }
);

SwipeableRow.displayName = 'SwipeableRow';

const createStyles = ({ colors }) =>
    StyleSheet.create({
        container: {
            // The panel is revealed from under the row, so the row's own
            // height is unchanged and nothing below it moves.
            backgroundColor: colors.danger,
            borderRadius: radius.m,
            marginBottom: spacing.s,
        },
        action: {
            width: ACTION_WIDTH,
            // Fills the row's height, which is comfortably past 44pt.
            height: '100%',
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.danger,
        },
        actionText: {
            marginTop: spacing.xs,
            fontSize: 12,
            fontWeight: '600',
            color: colors.onDanger,
            textAlign: 'center',
        },
    });

export default SwipeableRow;
