import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    light,
    dark,
    categoryPaletteLight,
    categoryPaletteDark,
} from './palette';

// Spacing and radius carry no colour, so they never change with the scheme and
// stay plain imports rather than going through the hook.
export const spacing = {
    xs: 4,
    s: 8,
    m: 12,
    l: 16,
    xl: 24,
    xxl: 32,
    xxxl: 48,
};

export const radius = {
    s: 10,
    m: 14,
    l: 20,
    xl: 28,
    round: 999,
};

// tabular numerals keep currency columns from shifting as digits change
const tabular = { fontVariant: ['tabular-nums'] };

const createTypography = (colors) => ({
    display: {
        fontSize: 36,
        fontWeight: '700',
        letterSpacing: -1,
        color: colors.textPrimary,
        ...tabular,
    },
    h1: {
        fontSize: 22,
        fontWeight: '700',
        letterSpacing: -0.3,
        color: colors.textPrimary,
    },
    h2: {
        fontSize: 17,
        fontWeight: '600',
        color: colors.textPrimary,
    },
    body: {
        fontSize: 15,
        color: colors.textPrimary,
    },
    bodyMuted: {
        fontSize: 15,
        color: colors.textMuted,
    },
    caption: {
        fontSize: 13,
        color: colors.textMuted,
    },
    overline: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        color: colors.textMuted,
    },
    amount: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.textPrimary,
        ...tabular,
    },
});

// A shadow that reads as depth on cream reads as nothing on a dark canvas —
// there is no darker colour to cast against. Dark mode leans on the border
// instead, keeping only the elevation Android needs for stacking order.
const createShadows = (colors, isDark) =>
    isDark
        ? {
              card: { elevation: 0 },
              raised: {
                  shadowColor: '#000000',
                  shadowOffset: { width: 0, height: 6 },
                  shadowRadius: 18,
                  shadowOpacity: 0.45,
                  elevation: 6,
              },
          }
        : {
              // Soft and wide rather than dark and tight.
              card: {
                  shadowColor: '#5B4A33',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.06,
                  shadowRadius: 10,
                  elevation: 2,
              },
              raised: {
                  shadowColor: colors.brand,
                  shadowOffset: { width: 0, height: 6 },
                  shadowRadius: 18,
                  shadowOpacity: 0.18,
                  elevation: 6,
              },
          };

export const gradientAngles = {
    diagonal: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
    leftToRight: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
    topToBottom: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
};

const buildTheme = (isDark) => {
    const colors = isDark ? dark : light;

    return {
        isDark,
        colors,
        typography: createTypography(colors),
        shadows: createShadows(colors, isDark),
        categoryPalette: isDark ? categoryPaletteDark : categoryPaletteLight,
        // The one and only gradient in the app.
        balanceGradient: [colors.brand, colors.brandSoft],
        dangerGradient: isDark ? ['#A8453D', '#E8776E'] : ['#A8352E', '#C2453D'],
        gradientAngles,
        spacing,
        radius,
    };
};

// Built once each rather than per render, so the object identity a screen's
// useMemo depends on changes only when the scheme actually does.
const THEMES = {
    light: buildTheme(false),
    dark: buildTheme(true),
};

const PREFERENCE_KEY = 'themePreference';
export const THEME_PREFERENCES = ['system', 'light', 'dark'];

const ThemeContext = createContext(null);

export const useTheme = () => {
    const value = useContext(ThemeContext);
    if (!value) {
        throw new Error('useTheme must be used inside <ThemeProvider>');
    }
    return value;
};

export const ThemeProvider = ({ children }) => {
    const systemScheme = useColorScheme();
    const [preference, setPreference] = useState('system');

    useEffect(() => {
        AsyncStorage.getItem(PREFERENCE_KEY)
            .then((stored) => {
                if (THEME_PREFERENCES.includes(stored)) {
                    setPreference(stored);
                }
            })
            .catch(() => {
                // A missing or unreadable preference just means following the
                // system, which is already the default.
            });
    }, []);

    const value = useMemo(() => {
        const resolved = preference === 'system' ? systemScheme : preference;
        const theme = resolved === 'dark' ? THEMES.dark : THEMES.light;

        return {
            ...theme,
            preference,
            setPreference: (next) => {
                setPreference(next);
                AsyncStorage.setItem(PREFERENCE_KEY, next).catch(() => {
                    // Best effort: the choice still applies for this session.
                });
            },
        };
    }, [preference, systemScheme]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
