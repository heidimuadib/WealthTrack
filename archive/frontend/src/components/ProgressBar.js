import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

const ProgressBar = ({
    progress = 0,
    color = colors.brand,
    trackColor = colors.surfaceAlt,
    height = 8,
}) => {
    const clamped = Math.max(0, Math.min(progress, 1));

    return (
        <View style={[styles.track, { height, backgroundColor: trackColor }]}>
            <View
                style={[
                    styles.fill,
                    { width: `${clamped * 100}%`, backgroundColor: color, height },
                ]}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    track: {
        width: '100%',
        borderRadius: radius.round,
        overflow: 'hidden',
    },
    fill: {
        borderRadius: radius.round,
    },
});

export default ProgressBar;
