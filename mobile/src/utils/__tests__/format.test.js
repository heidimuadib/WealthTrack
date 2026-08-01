import {
    formatCurrency,
    formatCompact,
    splitCurrency,
    monthName,
    monthNameShort,
    formatMonthYear,
    formatDayLabel,
    shiftMonth,
    isFutureMonth,
    currentMonthYear,
} from '../format';

describe('formatCurrency', () => {
    it('formats zero with centavos', () => {
        expect(formatCurrency(0)).toBe('₱0.00');
    });

    it('groups thousands and keeps two decimals', () => {
        expect(formatCurrency(1234567.5)).toBe('₱1,234,567.50');
    });

    it('puts the minus sign before the peso sign', () => {
        expect(formatCurrency(-50)).toBe('-₱50.00');
    });

    it('adds a plus only when asked', () => {
        expect(formatCurrency(25, { sign: true })).toBe('+₱25.00');
        expect(formatCurrency(25)).toBe('₱25.00');
    });

    it('treats non-numeric input as zero rather than printing NaN', () => {
        expect(formatCurrency('not a number')).toBe('₱0.00');
        expect(formatCurrency(undefined)).toBe('₱0.00');
    });
});

describe('formatCompact', () => {
    it('drops the centavos and rounds', () => {
        expect(formatCompact(1999.99)).toBe('₱2,000');
        expect(formatCompact(1500)).toBe('₱1,500');
    });
});

describe('splitCurrency', () => {
    it('splits a figure into sign, symbol, whole and fraction', () => {
        expect(splitCurrency(1234.5)).toEqual({
            sign: '',
            symbol: '₱',
            whole: '1,234',
            fraction: '.50',
        });
    });

    it('carries the sign separately from the digits', () => {
        expect(splitCurrency(-7.25)).toEqual({
            sign: '-',
            symbol: '₱',
            whole: '7',
            fraction: '.25',
        });
    });

    it('keeps whole and fraction describing the same rounded amount', () => {
        // 100.999 rounds to 101.00 — the parts must agree with each other,
        // never "100" next to ".00".
        expect(splitCurrency(100.999)).toEqual({
            sign: '',
            symbol: '₱',
            whole: '101',
            fraction: '.00',
        });
    });
});

describe('month names', () => {
    it('is one-indexed like the API', () => {
        expect(monthName(1)).toBe('January');
        expect(monthName(12)).toBe('December');
        expect(monthNameShort(8)).toBe('Aug');
    });

    it('returns an empty string out of range instead of crashing', () => {
        expect(monthName(0)).toBe('');
        expect(monthName(13)).toBe('');
    });

    it('formats a month heading', () => {
        expect(formatMonthYear(8, 2026)).toBe('August 2026');
    });
});

describe('shiftMonth', () => {
    it('rolls the year going forward past December', () => {
        expect(shiftMonth({ month: 12, year: 2026 }, 1)).toEqual({ month: 1, year: 2027 });
    });

    it('rolls the year going back past January', () => {
        expect(shiftMonth({ month: 1, year: 2026 }, -1)).toEqual({ month: 12, year: 2025 });
    });

    it('handles jumps larger than a year', () => {
        expect(shiftMonth({ month: 8, year: 2026 }, 14)).toEqual({ month: 10, year: 2027 });
    });
});

describe('date-dependent helpers', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 7, 15, 12, 0, 0)); // 15 Aug 2026, local
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('currentMonthYear reflects the frozen clock', () => {
        expect(currentMonthYear()).toEqual({ month: 8, year: 2026 });
    });

    it('isFutureMonth blocks later months and allows the present and past', () => {
        expect(isFutureMonth({ month: 9, year: 2026 })).toBe(true);
        expect(isFutureMonth({ month: 1, year: 2027 })).toBe(true);
        expect(isFutureMonth({ month: 8, year: 2026 })).toBe(false);
        expect(isFutureMonth({ month: 12, year: 2025 })).toBe(false);
    });

    it('labels today and yesterday in words, older dates as dates', () => {
        expect(formatDayLabel('2026-08-15T09:00:00')).toBe('Today');
        expect(formatDayLabel('2026-08-14T22:00:00')).toBe('Yesterday');
        expect(formatDayLabel('2026-03-05T10:00:00')).toBe('Mar 5, 2026');
    });

    it('returns an empty string for unparseable dates', () => {
        expect(formatDayLabel('not-a-date')).toBe('');
    });
});
