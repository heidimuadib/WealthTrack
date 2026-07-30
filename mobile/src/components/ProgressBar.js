import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { radius, useTheme } from '../theme';

// color and trackColor cannot default in the parameter list any more: those
// are evaluated once when the module loads, which would pin them to whichever
// scheme happened to be active at startup.
const ProgressBar = ({ progress = 0, color, trackColor, height = 8 }) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    const clamped = Math.max(0, Math.min(progress, 1));

    return (
        <View
            style={[
                styles.track,
                { height, backgroundColor: trackColor ?? theme.colors.surfaceAlt },
            ]}
        >
            <View
                style={[
                    styles.fill,
                    {
                        width: `${clamped * 100}%`,
                        backgroundColor: color ?? theme.colors.brand,
                        height,
                    },
                ]}
            />
        </View>
    );
};

const createStyles = () =>
    StyleSheet.create({
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
