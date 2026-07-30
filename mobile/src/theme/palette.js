// Two palettes for the same identity: a warm cream neo-bank in light, and its
// after-dark counterpart. Dark is not the light palette inverted — the canvas
// keeps a brown cast rather than going neutral black, and the teal is lifted
// several steps because the deep brand colour has almost no contrast against a
// dark surface.

export const light = {
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

    // Scrim behind modals
    scrim: 'rgba(22,48,45,0.45)',

    // The snackbar deliberately inverts the surface so it reads as an overlay
    // rather than another card. Its action colour has to contrast with that
    // inverted background, not with the canvas.
    snackbarSurface: '#16302D',
    snackbarText: '#FFFFFF',
    snackbarAction: '#7FD1C7',
};

export const dark = {
    // Warm near-black rather than neutral, so the cream identity survives.
    canvas: '#15120E',
    surface: '#1E1A15',
    surfaceAlt: '#2A241C',

    // The light-mode teal is unreadable on a dark surface; these are lifted
    // far enough to carry text and icons.
    brand: '#4FB8AC',
    brandSoft: '#6FCEC2',
    brandTint: '#1B3936',
    onBrand: '#08201E',

    textPrimary: '#F3EEE4',
    textSecondary: '#BFB6A7',
    textMuted: '#8C8376',
    textOnBrandMuted: 'rgba(8,32,30,0.72)',

    border: '#302921',
    borderStrong: '#453B30',

    danger: '#E8776E',
    dangerTint: '#3A211F',
    success: '#5FBF8F',
    successTint: '#1B3329',
    warning: '#D9A648',
    warningTint: '#33280F',

    scrim: 'rgba(0,0,0,0.6)',

    // Inverted the other way: a light overlay above a dark app, which needs a
    // dark teal action rather than the light one used on cream.
    snackbarSurface: '#F3EEE4',
    snackbarText: '#15120E',
    snackbarAction: '#0E5A54',
};

// Category swatches are shared: they are user data, and a category the user
// coloured orange should stay recognisably orange in either scheme. The dark
// set is lifted just enough to stay legible on a dark canvas.
export const categoryPaletteLight = [
    '#C2703D', '#3D7EA6', '#A6453D', '#7A5AA6',
    '#2E7D5B', '#B5527E', '#3D8FA6', '#7B8785',
];

export const categoryPaletteDark = [
    '#D98A57', '#5B9BC4', '#C4635A', '#9878C4',
    '#4C9B78', '#D06F9B', '#5AACC4', '#9A9184',
];
