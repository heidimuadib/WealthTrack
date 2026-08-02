import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { spacing, useTheme } from '../theme';
import { formatCompact } from '../utils/format';

// Built directly on react-native-svg rather than a chart library so the ring
// matches the rest of the design. Segments are drawn by advancing the dash
// offset around a single stroked circle.
//
// A thin ring rather than a thick one: at 20px a one-category month rendered
// as a heavy solid band that shouted over the number it was framing.
// The caption has no default wording: a component this far from the language
// context should not be the place an untranslated English word survives, and
// the one caller already passes a translated string.
const DonutChart = ({ data = [], size = 172, thickness = 13, caption = '' }) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    const radius = (size - thickness) / 2;
    const circumference = 2 * Math.PI * radius;
    const total = data.reduce((sum, item) => sum + item.value, 0);

    const slices = data.filter((item) => item.value > 0);

    // A sliver of canvas between neighbours so segments read as separate
    // quantities instead of one striped band. A full-circle single segment
    // has no neighbours, so no gap.
    const gap = slices.length > 1 ? 3 : 0;

    let cursor = 0;
    const segments = slices.map((item) => {
        const length = total > 0 ? (item.value / total) * circumference : 0;
        // The gap comes out of the paint, split across both ends so each
        // segment stays centred on its true share. Tiny shares keep a 2px
        // stub rather than vanishing entirely.
        const painted = Math.max(length - gap, 2);
        const segment = { ...item, painted, offset: cursor + (length - painted) / 2 };
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
                        stroke={theme.colors.surfaceAlt}
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
                            strokeDasharray={`${segment.painted} ${circumference - segment.painted}`}
                            strokeDashoffset={-segment.offset}
                            strokeLinecap="butt"
                            fill="none"
                        />
                    ))}
                </G>
            </Svg>

            <View style={styles.center} pointerEvents="none">
                {caption ? <Text style={styles.caption}>{caption}</Text> : null}
                <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCompact(total)}
                </Text>
            </View>
        </View>
    );
};

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
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
            fontFamily: 'SpaceGrotesk-Bold',
            letterSpacing: -0.5,
            color: colors.textPrimary,
        },
    });

export default DonutChart;
