import AsyncStorage from '@react-native-async-storage/async-storage';

import {
    monthKey,
    shouldShowBudgetPrompt,
    readDismissedMonths,
    rememberDismissal,
} from '../budgetPrompt';
import { LOADING, ERROR, EMPTY, CONTENT } from '../viewState';

const AUGUST = { month: 8, year: 2026 };
const SEPTEMBER = { month: 9, year: 2026 };

const loaded = { state: CONTENT, budget: 0, period: AUGUST, dismissedMonths: [] };

beforeEach(async () => {
    await AsyncStorage.clear();
});

describe('monthKey', () => {
    it('pads the month so keys sort and compare as strings', () => {
        expect(monthKey(AUGUST)).toBe('2026-08');
        expect(monthKey({ month: 12, year: 2026 })).toBe('2026-12');
    });

    it('distinguishes the same month in different years', () => {
        expect(monthKey({ month: 8, year: 2025 })).not.toBe(monthKey(AUGUST));
    });
});

describe('shouldShowBudgetPrompt — when it stays quiet', () => {
    it('never appears while the dashboard is still loading', () => {
        // The skeleton wins. Offering to fix something the app has not
        // finished looking at is guessing.
        expect(shouldShowBudgetPrompt({ ...loaded, state: LOADING })).toBe(false);
    });

    it('never appears over an error', () => {
        // A missing budget here may be a budget that could not be fetched.
        expect(shouldShowBudgetPrompt({ ...loaded, state: ERROR })).toBe(false);
    });

    it('never appears for a month that already has a budget', () => {
        expect(shouldShowBudgetPrompt({ ...loaded, budget: 5000 })).toBe(false);
        // Even a small one is a budget.
        expect(shouldShowBudgetPrompt({ ...loaded, budget: 1 })).toBe(false);
    });

    it('never appears once dismissed for that month', () => {
        expect(shouldShowBudgetPrompt({ ...loaded, dismissedMonths: ['2026-08'] })).toBe(false);
    });

    it('refuses to decide without a month', () => {
        expect(shouldShowBudgetPrompt({ ...loaded, period: undefined })).toBe(false);
    });

    it('refuses to decide when called with nothing', () => {
        expect(shouldShowBudgetPrompt()).toBe(false);
    });
});

describe('shouldShowBudgetPrompt — when it offers', () => {
    it('appears once the data has arrived and there is no budget', () => {
        expect(shouldShowBudgetPrompt(loaded)).toBe(true);
    });

    it('treats no budget and a zero budget the same way', () => {
        // Both mean the same thing to the person looking at the screen.
        expect(shouldShowBudgetPrompt({ ...loaded, budget: 0 })).toBe(true);
        expect(shouldShowBudgetPrompt({ ...loaded, budget: undefined })).toBe(true);
        expect(shouldShowBudgetPrompt({ ...loaded, budget: null })).toBe(true);
    });

    it('still offers on a month with no expenses at all', () => {
        // An empty month is exactly when planning one is easiest.
        expect(shouldShowBudgetPrompt({ ...loaded, state: EMPTY })).toBe(false);
        expect(shouldShowBudgetPrompt({ ...loaded, state: CONTENT })).toBe(true);
    });

    it('dismissal in one month does not silence another', () => {
        expect(
            shouldShowBudgetPrompt({
                ...loaded,
                period: SEPTEMBER,
                dismissedMonths: ['2026-08'],
            })
        ).toBe(true);
    });
});

describe('remembering a dismissal', () => {
    it('starts with nothing dismissed', async () => {
        expect(await readDismissedMonths()).toEqual([]);
    });

    it('survives a restart, which is what makes it a dismissal and not a hide', async () => {
        await rememberDismissal(AUGUST);

        // A fresh read is what the next app launch does.
        expect(await readDismissedMonths()).toEqual(['2026-08']);
        expect(
            shouldShowBudgetPrompt({ ...loaded, dismissedMonths: await readDismissedMonths() })
        ).toBe(false);
    });

    it('keeps earlier months, so stepping ahead does not reopen the last one', async () => {
        await rememberDismissal(AUGUST);
        await rememberDismissal(SEPTEMBER);

        const stored = await readDismissedMonths();
        expect(stored).toEqual(['2026-08', '2026-09']);
        expect(shouldShowBudgetPrompt({ ...loaded, dismissedMonths: stored })).toBe(false);
    });

    it('does not grow a duplicate when dismissed twice', async () => {
        await rememberDismissal(AUGUST);
        await rememberDismissal(AUGUST);

        expect(await readDismissedMonths()).toEqual(['2026-08']);
    });

    it('keeps at most a year of history', async () => {
        for (let month = 1; month <= 14; month += 1) {
            await rememberDismissal({ month: ((month - 1) % 12) + 1, year: 2026 + Math.floor((month - 1) / 12) });
        }

        const stored = await readDismissedMonths();
        expect(stored.length).toBeLessThanOrEqual(12);
    });

    it('stores a month and nothing else', async () => {
        await rememberDismissal(AUGUST);

        // Whatever else this preference is, it must not be able to say
        // anything about somebody's money.
        const raw = await AsyncStorage.getItem('budgetPromptDismissed');
        expect(raw).toBe('["2026-08"]');
        expect(raw).not.toMatch(/₱|amount|budget.*\d{3}/i);
    });

    it('survives unreadable storage rather than breaking the dashboard', async () => {
        await AsyncStorage.setItem('budgetPromptDismissed', 'not json at all');
        expect(await readDismissedMonths()).toEqual([]);

        await AsyncStorage.setItem('budgetPromptDismissed', '{"not":"an array"}');
        expect(await readDismissedMonths()).toEqual([]);
    });
});
