// The module reads __DEV__ once, at import, so each case re-imports it with the
// flag set the way the corresponding build would set it.
const loadApiUrl = (dev) => {
    jest.resetModules();
    global.__DEV__ = dev;
    return require('../api.config').API_URL;
};

describe('API_URL', () => {
    const original = global.__DEV__;

    afterEach(() => {
        global.__DEV__ = original;
    });

    it('talks to the LAN over plain HTTP in development', () => {
        // Asserted by shape, not by value: the LAN address follows whatever
        // the development machine's Wi-Fi hands out.
        expect(loadApiUrl(true)).toMatch(/^http:\/\/\d+\.\d+\.\d+\.\d+:3000$/);
    });

    it('talks to the deployed host in a release build', () => {
        expect(loadApiUrl(false)).toBe('https://wealthtrack.duckdns.org');
    });

    it('never points a release build at HTTP', () => {
        // A release build carries no cleartext permission, so http:// here
        // would fail every request on the device rather than downgrade.
        expect(loadApiUrl(false).startsWith('https://')).toBe(true);
    });

    it('never points a release build at a private or loopback address', () => {
        const url = loadApiUrl(false);
        expect(url).not.toMatch(/localhost|127\.0\.0\.1|10\.0\.2\.2|\d+\.\d+\.\d+\.\d+/);
    });

    it('carries no trailing slash, so joined paths cannot double up', () => {
        expect(loadApiUrl(false).endsWith('/')).toBe(false);
    });
});
