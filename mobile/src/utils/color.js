// Colours are generated in HSL and converted to hex so everything the picker
// produces stays inside the muted range the rest of the theme uses. Raw random
// RGB would happily hand back neon.

const SATURATION = { min: 38, max: 62 };
const LIGHTNESS = { min: 38, max: 54 };

export const hslToHex = (h, s, l) => {
    const lightness = l / 100;
    const a = (s / 100) * Math.min(lightness, 1 - lightness);

    const channel = (n) => {
        const k = (n + h / 30) % 12;
        const value = lightness - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
        return Math.round(255 * value)
            .toString(16)
            .padStart(2, '0');
    };

    return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
};

const randomBetween = (min, max) => min + Math.random() * (max - min);

// A fresh colour that still belongs to the palette.
export const randomCategoryColor = () =>
    hslToHex(
        Math.floor(Math.random() * 360),
        Math.round(randomBetween(SATURATION.min, SATURATION.max)),
        Math.round(randomBetween(LIGHTNESS.min, LIGHTNESS.max))
    );

// A spectrum grid: every hue at two lightness levels, so there is real choice
// without a drag-based picker and its PanResponder.
export const buildColorGrid = (hueSteps = 12) => {
    const swatches = [];

    for (let row = 0; row < 2; row += 1) {
        const lightness = row === 0 ? 46 : 36;
        const saturation = row === 0 ? 50 : 42;

        for (let i = 0; i < hueSteps; i += 1) {
            swatches.push(hslToHex(Math.round((360 / hueSteps) * i), saturation, lightness));
        }
    }

    // A couple of neutrals for categories that should not shout.
    swatches.push('#7B8785', '#4C5B58');
    return swatches;
};

export const isValidHex = (value) => /^#[0-9A-Fa-f]{6}$/.test(value);

export const normaliseHex = (value) => {
    const trimmed = String(value || '').trim();
    const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    return withHash.toUpperCase();
};

// Picks black or white text for a swatch based on perceived brightness, so the
// selected-checkmark stays legible on both pale and dark colours.
export const contrastOn = (hex) => {
    if (!isValidHex(hex)) {
        return '#FFFFFF';
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#16302D' : '#FFFFFF';
};
