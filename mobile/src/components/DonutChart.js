import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors, spacing, typography } from '../theme';
import { formatCompact } from '../utils/format';

// Built directly on react-native-svg rather than a chart library so the ring
// matches the rest of the design. Segments are drawn by advancing the dash
// offset around a single stroked circle.
const DonutChart = ({ data = [], size = 172, thickness = 20, caption = 'Total' }) => {
    const radius = (size - thickness) / 2;
    const circumference = 2 * Math.PI * radius;
    const total = data.reduce((sum, item) => sum + item.value, 0);

    let cursor = 0;
    const segments = data
        .filter((item) => item.value > 0)
        .map((item) => {
            const length = total > 0 ? (item.value / total) * circumference : 0;
            const segment = { ...item, length, offset: cursor };
            cursor += length;
            return segment;
        });

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            <Svg width={size} height={size}>
                {/* -90° puts the first segment at 12 o'clock instead of 3. */}
                <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
                    <Circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        stroke={colors.surfaceAlt}
                        strokeWidth={thickness}
                        fill="none"
                    />

                    {segments.map((segment, index) => (
                        <Circle
                            key={`${segment.label}-${index}`}
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            stroke={segment.color}
                            strokeWidth={thickness}
                            strokeDasharray={`${segment.length} ${circumference - segment.length}`}
                            strokeDashoffset={-segment.offset}
                            strokeLinecap="butt"
                            fill="none"
                        />
                    ))}
                </G>
            </Svg>

            <View style={styles.center} pointerEvents="none">
                <Text style={styles.caption}>{caption}</Text>
                <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCompact(total)}
                </Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    center: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.xl,
    },
    caption: {
        ...typography.overline,
        marginBottom: 2,
    },
    total: {
        fontSize: 22,
        fontWeight: '700',
        letterSpacing: -0.5,
        color: colors.textPrimary,
        fontVariant: ['tabular-nums'],
    },
});

export default DonutChart;
