import { translate, getMonths, getMonthsShort, LANGUAGES } from '../index';
import { STRINGS } from '../strings';

// translate() reads the module-level current language, which the provider sets.
// Tests drive it the same way by re-requiring with a set language would be
// awkward, so they exercise the dictionaries directly where language matters
// and translate() for the interpolation and fallback behaviour.

describe('dictionaries', () => {
    it('ships the three advertised languages', () => {
        expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'fil', 'ceb']);
        LANGUAGES.forEach((l) => expect(STRINGS[l.code]).toBeDefined());
    });

    it('gives every language twelve month names, long and short', () => {
        Object.values(STRINGS).forEach((table) => {
            expect(table.months).toHaveLength(12);
            expect(table.monthsShort).toHaveLength(12);
        });
    });

    it('translates every key English defines, or deliberately inherits it', () => {
        // A missing key is not a failure — lookup falls back to English — but
        // an *empty* translation would render as blank UI, which is.
        Object.entries(STRINGS).forEach(([code, table]) => {
            Object.entries(table).forEach(([key, value]) => {
                if (typeof value === 'string') {
                    expect(value.trim()).not.toBe('');
                } else {
                    expect(Array.isArray(value)).toBe(true);
                }
            });
            expect(code).toBeTruthy();
        });
    });

    it('keeps every placeholder English uses in the translations that define the key', () => {
        const placeholders = (text) => (String(text).match(/\{[a-z]+\}/gi) || []).sort();

        Object.entries(STRINGS.en).forEach(([key, englishValue]) => {
            if (typeof englishValue !== 'string') {
                return;
            }
            const expected = placeholders(englishValue);
            if (expected.length === 0) {
                return;
            }
            ['fil', 'ceb'].forEach((code) => {
                const translated = STRINGS[code][key];
                if (translated === undefined) {
                    return; // falls back to English, which is fine
                }
                expect({ key, code, found: placeholders(translated) }).toEqual({
                    key,
                    code,
                    found: expected,
                });
            });
        });
    });
});

describe('translate', () => {
    it('returns the English string by default', () => {
        expect(translate('card.spentThisMonth')).toBe('Spent this month');
    });

    it('interpolates named placeholders', () => {
        expect(translate('card.leftOf', { left: '₱500', budget: '₱2,000' })).toBe(
            '₱500 left of ₱2,000'
        );
    });

    it('replaces every occurrence of a placeholder', () => {
        expect(translate('reports.emptyTitle', { year: 2026 })).toBe('Nothing recorded in 2026');
    });

    it('returns the key itself when it is unknown, so the gap is visible', () => {
        expect(translate('does.not.exist')).toBe('does.not.exist');
    });

    it('leaves unfilled placeholders alone rather than printing undefined', () => {
        expect(translate('card.percentUsed')).toBe('{percent}% used');
    });
});

describe('month accessors', () => {
    it('returns the active language month tables', () => {
        expect(getMonths()[0]).toBe('January');
        expect(getMonthsShort()[11]).toBe('Dec');
    });
});
