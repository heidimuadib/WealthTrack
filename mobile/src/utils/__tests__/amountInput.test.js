import {
    pressKey,
    toAmount,
    fromAmount,
    formatDisplay,
    MAX_INTEGER_DIGITS,
    MAX_DECIMALS,
} from '../amountInput';

// Types a whole string of keys in order, which is how every case below reads
// as the sequence a thumb would actually produce.
const type = (keys, start = '') => keys.split('').reduce(pressKey, start);

describe('pressKey — digits', () => {
    it('appends digits in order', () => {
        expect(type('120')).toBe('120');
    });

    it('replaces a lone zero rather than keeping it', () => {
        expect(type('05')).toBe('5');
    });

    it('keeps zeros that follow a real digit', () => {
        expect(type('100')).toBe('100');
    });

    it('stops at the integer ceiling', () => {
        const full = '9'.repeat(MAX_INTEGER_DIGITS);
        expect(pressKey(full, '9')).toBe(full);
    });

    it('ignores a key that is not a digit, a dot, or delete', () => {
        expect(pressKey('12', 'x')).toBe('12');
        expect(pressKey('12', '')).toBe('12');
    });
});

describe('pressKey — decimals', () => {
    it('supplies a leading zero when the dot comes first', () => {
        expect(type('.')).toBe('0.');
        expect(type('.5')).toBe('0.5');
    });

    it('accepts only one dot', () => {
        expect(type('1.2.3')).toBe('1.23');
    });

    it('stops at two decimal places', () => {
        expect(type('1.999')).toBe('1.99');
        expect(MAX_DECIMALS).toBe(2);
    });

    it('lets the integer ceiling be exceeded on the decimal side', () => {
        const full = '9'.repeat(MAX_INTEGER_DIGITS);
        expect(pressKey(`${full}.`, '5')).toBe(`${full}.5`);
    });
});

describe('pressKey — delete', () => {
    it('removes the last character', () => {
        expect(pressKey('120', 'del')).toBe('12');
    });

    it('removes the dot itself', () => {
        expect(pressKey('12.', 'del')).toBe('12');
    });

    it('is harmless on an empty value', () => {
        expect(pressKey('', 'del')).toBe('');
    });

    it('allows a second dot once the first is deleted', () => {
        expect(type('1.', '')).toBe('1.');
        expect(pressKey(pressKey('1.', 'del'), '.')).toBe('1.');
    });
});

describe('toAmount', () => {
    it('returns the number for a complete value', () => {
        expect(toAmount('120')).toBe(120);
        expect(toAmount('120.5')).toBe(120.5);
    });

    it('refuses anything that is not a saveable amount', () => {
        expect(toAmount('')).toBeNull();
        expect(toAmount('0')).toBeNull();
        expect(toAmount('0.00')).toBeNull();
        expect(toAmount('.')).toBeNull();
    });

    it('treats a half-typed decimal as its whole part', () => {
        expect(toAmount('12.')).toBe(12);
    });

    it('never produces a third decimal the money column cannot store', () => {
        expect(toAmount('1.005')).toBe(1.01);
        expect(toAmount('0.999')).toBe(1);
    });
});

describe('fromAmount', () => {
    it('seeds the keypad from an existing expense', () => {
        expect(fromAmount(120)).toBe('120');
        expect(fromAmount(120.5)).toBe('120.5');
    });

    it('drops trailing zeros so editing starts on the peso figure', () => {
        expect(fromAmount(120.0)).toBe('120');
    });

    it('returns an empty keypad for a missing or unusable amount', () => {
        expect(fromAmount(0)).toBe('');
        expect(fromAmount(null)).toBe('');
        expect(fromAmount(undefined)).toBe('');
    });

    it('round-trips through the keypad unchanged', () => {
        expect(toAmount(fromAmount(1234.56))).toBe(1234.56);
    });
});

describe('formatDisplay', () => {
    it('shows a zero rather than an empty display', () => {
        expect(formatDisplay('')).toBe('0');
    });

    it('groups thousands', () => {
        expect(formatDisplay('1234')).toBe('1,234');
        expect(formatDisplay('1234567')).toBe('1,234,567');
    });

    it('leaves the decimal side ungrouped and exactly as typed', () => {
        expect(formatDisplay('1234.5')).toBe('1,234.5');
        expect(formatDisplay('1234.50')).toBe('1,234.50');
    });

    it('keeps a trailing dot visible while it is being typed', () => {
        expect(formatDisplay('12.')).toBe('12.');
    });
});
