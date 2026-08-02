import AsyncStorage from '@react-native-async-storage/async-storage';

import { CONTENT } from './viewState';

// Whether the dashboard offers to help set up a budget, and whether that offer
// has already been declined.
//
// The rule is deliberately narrow. A prompt that appears while data is still
// arriving would be guessing, and one that reappears after being dismissed is
// nagging — which is how a helpful suggestion turns into something people learn
// to tap past without reading.

const KEY = 'budgetPromptDismissed';

// A month, not a date and not an amount. This is the only thing stored, and it
// is worth being deliberate about: nothing here should be able to say anything
// about somebody's money, only about which month they closed a card in.
export const monthKey = ({ month, year } = {}) =>
    `${year}-${String(month).padStart(2, '0')}`;

// Twelve is a year of history, which is far more than the decision needs and
// still small enough that the whole list is one cheap read.
const MAX_REMEMBERED = 12;

export const shouldShowBudgetPrompt = ({
    state,
    budget,
    period,
    dismissedMonths = [],
} = {}) => {
    // Only once the screen has real data. During loading there is nothing to
    // base this on, and during an error a missing budget may simply be a
    // budget that could not be fetched — offering to set a new one then would
    // be answering a question nobody asked.
    if (state !== CONTENT) {
        return false;
    }

    // A budget of zero and no budget at all are the same thing to the person
    // looking at the screen.
    if (typeof budget === 'number' && budget > 0) {
        return false;
    }

    if (!period) {
        return false;
    }

    return !dismissedMonths.includes(monthKey(period));
};

// Best effort in both directions. A preference that fails to load must not
// stop the dashboard rendering, and one that fails to save costs the user a
// second dismissal at worst.
export const readDismissedMonths = async () => {
    try {
        const stored = await AsyncStorage.getItem(KEY);
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
    } catch (error) {
        return [];
    }
};

// A list rather than a single value so that dismissing next month does not
// un-dismiss this one — someone who steps forward to plan ahead and then comes
// back should not be asked again about the month they already answered for.
export const rememberDismissal = async (period) => {
    const key = monthKey(period);

    try {
        const current = await readDismissedMonths();

        if (current.includes(key)) {
            return current;
        }

        const next = [...current, key].slice(-MAX_REMEMBERED);
        await AsyncStorage.setItem(KEY, JSON.stringify(next));
        return next;
    } catch (error) {
        // The card still closes for this session; only the memory of it is lost.
        return [key];
    }
};
