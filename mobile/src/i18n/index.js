import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STRINGS, LANGUAGES } from './strings';

export { LANGUAGES };

const LANGUAGE_KEY = 'appLanguage';

// Mirrors the provider's state so non-component code — the date helpers in
// utils/format, the error mapper — can read the active language without a
// hook. Components re-render through the context; these helpers are only ever
// called during renders that the context already triggered.
let current = 'en';

export const getCurrentLanguage = () => current;

const lookup = (key) => {
    const table = STRINGS[current] || STRINGS.en;
    const value = table[key];
    return value === undefined ? STRINGS.en[key] : value;
};

// translate('card.leftOf', { left: '₱500', budget: '₱2,000' })
export const translate = (key, params) => {
    let text = lookup(key);
    if (typeof text !== 'string') {
        return key;
    }
    if (params) {
        Object.keys(params).forEach((name) => {
            text = text.split(`{${name}}`).join(String(params[name]));
        });
    }
    return text;
};

// Month tables are arrays rather than keyed strings, so they get their own
// accessors instead of going through translate().
export const getMonths = () => lookup('months');
export const getMonthsShort = () => lookup('monthsShort');
export const getWeekdays = () => lookup('weekdays');

const LanguageContext = createContext(null);

export const useLanguage = () => {
    const value = useContext(LanguageContext);
    if (!value) {
        throw new Error('useLanguage must be used inside <LanguageProvider>');
    }
    return value;
};

export const LanguageProvider = ({ children }) => {
    const [language, setLanguageState] = useState('en');

    useEffect(() => {
        AsyncStorage.getItem(LANGUAGE_KEY)
            .then((stored) => {
                if (STRINGS[stored]) {
                    current = stored;
                    setLanguageState(stored);
                }
            })
            .catch(() => {
                // Unreadable preference just means English, the default.
            });
    }, []);

    const value = useMemo(
        () => ({
            language,
            setLanguage: (next) => {
                if (!STRINGS[next]) {
                    return;
                }
                current = next;
                setLanguageState(next);
                AsyncStorage.setItem(LANGUAGE_KEY, next).catch(() => {
                    // Best effort: the choice still applies for this session.
                });
            },
            // Fresh identity per language so memos keyed on `t` recompute.
            t: (key, params) => translate(key, params),
        }),
        [language]
    );

    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
