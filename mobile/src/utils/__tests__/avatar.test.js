// Pinned to the production host rather than read from the config, so this
// proves the joining rule against the value a release build actually uses.
jest.mock('../../config/api.config', () => ({
    API_URL: 'https://wealthtrack.duckdns.org',
}));

const { avatarUri, initialFor } = require('../avatar');

describe('avatarUri', () => {
    it('resolves a stored path against the production host', () => {
        expect(avatarUri({ avatarUrl: '/uploads/avatars/u1-1785593415318.png' })).toBe(
            'https://wealthtrack.duckdns.org/uploads/avatars/u1-1785593415318.png'
        );
    });

    it('produces exactly one slash between host and path', () => {
        const uri = avatarUri({ avatarUrl: '/uploads/avatars/u2-9.jpg' });
        expect(uri).not.toContain('.org//');
        // Only the two in "https://".
        expect(uri.split('//')).toHaveLength(2);
    });

    it('keeps the result on HTTPS', () => {
        expect(avatarUri({ avatarUrl: '/uploads/avatars/u3-1.webp' })).toMatch(/^https:\/\//);
    });

    it('has nothing to show when the account has no photo', () => {
        expect(avatarUri({ avatarUrl: null })).toBeNull();
        expect(avatarUri({})).toBeNull();
        expect(avatarUri(null)).toBeNull();
        expect(avatarUri(undefined)).toBeNull();
    });
});

describe('initialFor', () => {
    it('uses the first letter of the name, capitalised', () => {
        expect(initialFor({ name: 'eyxa' })).toBe('E');
        expect(initialFor({ name: '  bea santos ' })).toBe('B');
    });

    it('falls back when a Google account arrives without a name', () => {
        expect(initialFor({ name: null })).toBe('U');
        expect(initialFor({ name: '   ' })).toBe('U');
        expect(initialFor(null)).toBe('U');
    });
});
