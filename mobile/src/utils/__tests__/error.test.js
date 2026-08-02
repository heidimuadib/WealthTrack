import { errorMessage, errorTitle, isOffline, isHandledGlobally } from '../error';
import { serverMessageKey, SERVER_MESSAGE_KEYS } from '../serverErrors';

// Axios-shaped errors: a response means the server answered; a request with no
// response means it never did.
const offlineError = { request: {}, message: 'Network Error' };
const timeoutError = { code: 'ECONNABORTED', message: 'timeout exceeded' };
const status = (code, data) => ({ response: { status: code, data } });

describe('isOffline', () => {
    it('recognises a request that never got a response', () => {
        expect(isOffline(offlineError)).toBe(true);
        expect(isOffline(timeoutError)).toBe(true);
    });

    it('is false once the server has answered, whatever it said', () => {
        expect(isOffline(status(500))).toBe(false);
        expect(isOffline(status(400, { error: 'nope' }))).toBe(false);
    });
});

describe('errorMessage', () => {
    it('explains connectivity failures in connectivity terms', () => {
        expect(errorMessage(offlineError)).toBe(
            'Can’t reach the server. Check your connection and try again.'
        );
    });

    it('names rate limiting', () => {
        expect(errorMessage(status(429))).toBe('Too many requests. Wait a moment and try again.');
    });

    it('blames the server for 5xx', () => {
        expect(errorMessage(status(503))).toBe('The server had a problem. Please try again shortly.');
    });

    it('passes through the message the API wrote for a 4xx', () => {
        expect(errorMessage(status(400, { error: 'Invalid credentials' }))).toBe(
            'Invalid credentials'
        );
    });

    it('shows a message it does not recognise rather than swallowing it', () => {
        // A reworded or newer server message is still more use to the reader
        // than a generic apology, so it survives untranslated.
        expect(errorMessage(status(400, { error: 'Some brand new failure' }))).toBe(
            'Some brand new failure'
        );
    });

    it('renders every mapped server message through the dictionary', () => {
        // Under English the translation is the API's own wording, so this
        // asserts the lookup resolves rather than that the text changed —
        // a mapped key with no entry would surface as "server.someKey".
        Object.keys(SERVER_MESSAGE_KEYS).forEach((message) => {
            const rendered = errorMessage(status(400, { error: message }));
            expect({ message, rendered }).toEqual({ message, rendered: message });
        });
    });
});

describe('serverMessageKey', () => {
    it('maps a known sentence onto its translation key', () => {
        expect(serverMessageKey('Expense not found')).toBe('server.expenseNotFound');
    });

    it('ignores surrounding whitespace', () => {
        expect(serverMessageKey('  Expense not found  ')).toBe('server.expenseNotFound');
    });

    it('returns undefined for anything it does not know', () => {
        expect(serverMessageKey('Reworded next release')).toBeUndefined();
        expect(serverMessageKey(undefined)).toBeUndefined();
        expect(serverMessageKey(null)).toBeUndefined();
        expect(serverMessageKey(42)).toBeUndefined();
    });

    it('falls back to a generic message when the API sent none', () => {
        expect(errorMessage(status(400, {}))).toBe('Something went wrong. Please try again.');
        expect(errorMessage(status(400, { error: '   ' }))).toBe(
            'Something went wrong. Please try again.'
        );
    });
});

describe('errorTitle', () => {
    it('headlines the cause', () => {
        expect(errorTitle(offlineError)).toBe('No connection');
        expect(errorTitle(status(500))).toBe('Couldn’t load');
    });
});

describe('isHandledGlobally', () => {
    it('marks 401s, which the interceptor already turns into a logout', () => {
        expect(isHandledGlobally(status(401))).toBe(true);
        expect(isHandledGlobally(status(403))).toBe(false);
        expect(isHandledGlobally(offlineError)).toBe(false);
    });
});
