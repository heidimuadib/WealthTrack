import { errorMessage, errorTitle, isOffline, isHandledGlobally } from '../error';

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
