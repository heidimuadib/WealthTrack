import { translate, getMonths, getMonthsShort, getWeekdays, LANGUAGES } from '../index';
import { STRINGS } from '../strings';
import { SERVER_MESSAGE_KEYS } from '../../utils/serverErrors';

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

    it('gives every language seven weekday initials, Sunday first', () => {
        Object.values(STRINGS).forEach((table) => {
            expect(table.weekdays).toHaveLength(7);
        });
    });

    // Lookup still falls back to English for a missing key, so this is not
    // about avoiding a crash — it is the guard that keeps coverage finished.
    // Without it, the next screen someone adds translates itself in English
    // only and nothing says so until a Bisaya reader finds it.
    it('defines exactly the same keys in every language', () => {
        const en = Object.keys(STRINGS.en).sort();

        ['fil', 'ceb'].forEach((code) => {
            const keys = Object.keys(STRINGS[code]).sort();
            expect({ code, missing: en.filter((k) => !keys.includes(k)) }).toEqual({
                code,
                missing: [],
            });
            expect({ code, extra: keys.filter((k) => !en.includes(k)) }).toEqual({
                code,
                extra: [],
            });
        });
    });

    it('never ships an empty string, which would render as blank UI', () => {
        Object.entries(STRINGS).forEach(([code, table]) => {
            Object.entries(table).forEach(([key, value]) => {
                if (typeof value === 'string') {
                    expect({ code, key, blank: value.trim() === '' }).toEqual({
                        code,
                        key,
                        blank: false,
                    });
                } else {
                    expect(Array.isArray(value)).toBe(true);
                }
            });
        });
    });

    it('translates every server message the API can return', () => {
        // A mapped key with no dictionary entry would make translate() render
        // the key itself — "server.invalidDate" in front of the user.
        Object.entries(SERVER_MESSAGE_KEYS).forEach(([message, key]) => {
            ['en', 'fil', 'ceb'].forEach((code) => {
                expect({ message, code, defined: typeof STRINGS[code][key] === 'string' }).toEqual({
                    message,
                    code,
                    defined: true,
                });
            });
        });
    });

    it('uses the API’s own wording for the English server messages', () => {
        // The English side must stay verbatim: it is both what an English
        // reader sees and what the map is keyed on, so a drift between the two
        // means the map has silently stopped matching.
        Object.entries(SERVER_MESSAGE_KEYS).forEach(([message, key]) => {
            expect({ key, english: STRINGS.en[key] }).toEqual({ key, english: message });
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

describe('table accessors', () => {
    it('returns the active language month tables', () => {
        expect(getMonths()[0]).toBe('January');
        expect(getMonthsShort()[11]).toBe('Dec');
    });

    it('returns the active language weekday initials', () => {
        expect(getWeekdays()).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
    });
});
