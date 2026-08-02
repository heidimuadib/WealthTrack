import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, View, StyleSheet, Easing, AccessibilityInfo } from 'react-native';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';

// Placeholders shaped like the screen that is coming, rather than a spinner in
// the middle of an empty canvas. The point is not decoration: a spinner says
// "something is happening", a skeleton says "this is what is arriving and where
// it will be", so the eye is already in the right place when the figures land.
//
// One Animated.Value per group, shared through context to every block inside
// it. A value per block would mean a dozen independent loops driving the same
// pulse slightly out of step — more work for the UI thread and visibly
// shimmery. Opacity is drivable natively, so the loop runs off the JS thread
// entirely and a busy render cannot make it stutter.

const PulseContext = createContext(null);

// Never fully transparent: blocks that vanish and reappear read as flicker.
const DIM = 0.45;
const BRIGHT = 1;
const HALF_CYCLE = 700;
// What a still frame settles on when motion is reduced — between the two, so
// the blocks stay visible without ever being mistaken for real content.
const STILL = 0.7;

// Someone who has asked the OS for less animation should not get a pulsing
// screen. RN exposes this on both platforms; the optional calls keep the
// component working under a test renderer where the native module is absent.
const useReducedMotion = () => {
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        let alive = true;

        // Wrapped rather than chained directly: the method is missing on some
        // platforms and returns a non-promise on others, and a placeholder
        // must not be able to throw on mount over a preference lookup.
        Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
            .then((value) => {
                if (alive) {
                    setReduced(!!value);
                }
            })
            .catch(() => {
                // Unreadable means no preference to honour; the pulse stays.
            });

        const subscription = AccessibilityInfo.addEventListener?.(
            'reduceMotionChanged',
            (value) => setReduced(!!value)
        );

        return () => {
            alive = false;
            subscription?.remove?.();
        };
    }, []);

    return reduced;
};

// Wraps a screen's placeholders. Owns the animation, and is the single thing a
// screen reader announces — every block inside is hidden from it, so a loading
// dashboard says "Loading your dashboard" once instead of naming fourteen
// grey rectangles.
export const SkeletonGroup = ({ children, label, style }) => {
    const { t } = useLanguage();
    const reduced = useReducedMotion();
    const pulse = useRef(new Animated.Value(DIM)).current;

    useEffect(() => {
        if (reduced) {
            pulse.setValue(STILL);
            return undefined;
        }

        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, {
                    toValue: BRIGHT,
                    duration: HALF_CYCLE,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(pulse, {
                    toValue: DIM,
                    duration: HALF_CYCLE,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
            ])
        );

        loop.start();

        // Without this the loop outlives the screen: data arrives, the
        // skeleton unmounts, and the animation keeps driving a detached node.
        return () => loop.stop();
    }, [pulse, reduced]);

    return (
        <PulseContext.Provider value={pulse}>
            <View
                style={style}
                accessible
                accessibilityLabel={label || t('loading.generic')}
                accessibilityLiveRegion="polite"
            >
                {children}
            </View>
        </PulseContext.Provider>
    );
};

// A block outside any group still renders, just without the pulse — worth
// tolerating so a stray placeholder is never an invisible hole.
const usePulse = () => useContext(PulseContext) ?? BRIGHT;

// Decorative by definition. Hidden from both platforms' screen readers so the
// group's single announcement is the only thing heard.
const HIDDEN = {
    importantForAccessibility: 'no-hide-descendants',
    accessibilityElementsHidden: true,
};

export const SkeletonBlock = ({ width, height = 14, rounding = radius.s, style }) => {
    const { colors } = useTheme();
    const opacity = usePulse();

    return (
        <Animated.View
            {...HIDDEN}
            style={[
                {
                    width,
                    height,
                    borderRadius: rounding,
                    // An existing token rather than a new colour: borderStrong
                    // is the app's heaviest neutral, and it reads as a filled
                    // shape against both surface and canvas in either scheme.
                    backgroundColor: colors.borderStrong,
                    opacity,
                },
                style,
            ]}
        />
    );
};

export const SkeletonCircle = ({ size = 44, style }) => (
    <SkeletonBlock width={size} height={size} rounding={radius.round} style={style} />
);

// Lines of a paragraph. The last one is short, because a full-width final line
// is the one thing real text almost never does.
export const SkeletonText = ({ lines = 1, width = '100%', lastWidth = '60%', height = 12, gap = spacing.s, style }) => (
    <View style={style} {...HIDDEN}>
        {Array.from({ length: lines }).map((_, index) => (
            <SkeletonBlock
                key={index}
                width={index === lines - 1 && lines > 1 ? lastWidth : width}
                height={height}
                rounding={radius.s}
                style={index === 0 ? null : { marginTop: gap }}
            />
        ))}
    </View>
);

// Mirrors Card's surface, radius, border and padding, so the placeholder
// occupies exactly the box the real card will.
export const SkeletonCard = ({ children, style, padded = true }) => {
    const { colors } = useTheme();
    // Memoised on the palette rather than built through StyleSheet.create per
    // instance: a dashboard mounts several of these at once, and the only
    // part of the card that varies with the theme is these four values.
    const surface = useMemo(
        () => ({
            backgroundColor: colors.surface,
            borderRadius: radius.l,
            borderWidth: 1,
            borderColor: colors.border,
        }),
        [colors]
    );

    return <View style={[surface, padded && layout.padded, style]}>{children}</View>;
};

// The shape every list in the app repeats: a colour dot, a name over a
// caption, and an amount pinned right. dotSize follows the real row — the
// dashboard and category rows mark the category with a small dot, the expense
// list with a larger disc.
// No theme subscription at all: every colour in the row comes from the blocks
// themselves, so the row is pure layout and the sheet is built once.
export const SkeletonListRow = ({ dotSize = 38, caption = true, amount = true, style }) => (
    <View style={[layout.row, style]} {...HIDDEN}>
        <SkeletonCircle size={dotSize} />
        <View style={layout.rowText}>
            <SkeletonBlock width="55%" height={13} />
            {caption ? <SkeletonBlock width="32%" height={11} style={layout.rowCaption} /> : null}
        </View>
        {amount ? <SkeletonBlock width={64} height={15} /> : null}
    </View>
);

const layout = StyleSheet.create({
    padded: {
        padding: spacing.l,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.m,
    },
    rowText: {
        flex: 1,
        marginLeft: spacing.m,
    },
    rowCaption: {
        marginTop: spacing.s,
    },
});
