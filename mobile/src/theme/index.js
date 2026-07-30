// Soft neo-bank palette: a warm cream canvas, one deep teal brand colour, and
// a single accent gradient reserved for the balance card. Everything else is
// flat — the old theme put a gradient on every surface, so nothing stood out.

export const colors = {
    // Canvas & surfaces
    canvas: '#FAF6F0',
    surface: '#FFFFFF',
    surfaceAlt: '#F4EEE6',

    // Brand
    brand: '#0E5A54',
    brandSoft: '#14807A',
    brandTint: '#E3F0EE',
    onBrand: '#FFFFFF',

    // Text
    textPrimary: '#16302D',
    textSecondary: '#4C5B58',
    textMuted: '#7B8785',
    textOnBrandMuted: 'rgba(255,255,255,0.72)',

    // Lines
    border: '#E9E1D6',
    borderStrong: '#DDD2C3',

    // Semantic — desaturated so they sit calmly on cream
    danger: '#C2453D',
    dangerTint: '#FBEAE8',
    success: '#2E7D5B',
    successTint: '#E6F2EC',
    warning: '#B57A21',
    warningTint: '#FBF1DF',
};

// The one and only gradient in the app.
export const balanceGradient = [colors.brand, colors.brandSoft];
export const dangerGradient = ['#A8352E', '#C2453D'];

export const gradientAngles = {
    diagonal: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
    leftToRight: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
    topToBottom: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
};

// Refined category swatches — muted enough to coexist on a cream canvas.
export const categoryPalette = [
    '#C2703D', '#3D7EA6', '#A6453D', '#7A5AA6',
    '#2E7D5B', '#B5527E', '#3D8FA6', '#7B8785',
];

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

export const typography = {
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
};

export const shadows = {
    // Soft and wide rather than dark and tight.
    card: {
        shadowColor: '#5B4A33',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
    },
    raised: {
        shadowColor: '#0E5A54',
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 18,
        shadowOpacity: 0.18,
        elevation: 6,
    },
};
