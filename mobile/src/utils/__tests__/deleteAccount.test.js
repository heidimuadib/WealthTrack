import { confirmationMatches, canSubmitDeletion } from '../deleteAccount';

describe('confirmationMatches', () => {
    it('accepts the phrase as written', () => {
        expect(confirmationMatches('DELETE', 'DELETE')).toBe(true);
    });

    it('ignores case and surrounding spaces', () => {
        // A phone keyboard capitalises the first letter on its own; that is
        // not the user getting it wrong.
        expect(confirmationMatches('delete', 'DELETE')).toBe(true);
        expect(confirmationMatches('  Delete  ', 'DELETE')).toBe(true);
    });

    it('accepts each language’s own word', () => {
        expect(confirmationMatches('burahin', 'BURAHIN')).toBe(true);
        expect(confirmationMatches('papasa', 'PAPASA')).toBe(true);
    });

    it('rejects anything else', () => {
        expect(confirmationMatches('', 'DELETE')).toBe(false);
        expect(confirmationMatches('DELET', 'DELETE')).toBe(false);
        expect(confirmationMatches('DELETE ACCOUNT', 'DELETE')).toBe(false);
        expect(confirmationMatches('BURAHIN', 'DELETE')).toBe(false);
    });

    it('never matches against a missing phrase', () => {
        // If the phrase failed to resolve, an empty box must not sail through.
        expect(confirmationMatches('', '')).toBe(false);
        expect(confirmationMatches('   ', '   ')).toBe(false);
        expect(confirmationMatches('anything', '')).toBe(false);
    });

    it('rejects non-strings rather than throwing', () => {
        expect(confirmationMatches(undefined, 'DELETE')).toBe(false);
        expect(confirmationMatches(null, 'DELETE')).toBe(false);
        expect(confirmationMatches('DELETE', undefined)).toBe(false);
    });
});

describe('canSubmitDeletion — password accounts', () => {
    const account = { hasPassword: true, phrase: 'DELETE' };

    it('stays disabled until a password is typed', () => {
        expect(canSubmitDeletion({ ...account, password: '' })).toBe(false);
        expect(canSubmitDeletion({ ...account, password: 'a' })).toBe(true);
    });

    it('does not ask a password account for the phrase as well', () => {
        // The password is server-checked, which is a stronger guard than a
        // word typed into the same screen.
        expect(canSubmitDeletion({ ...account, password: 'hunter2', confirmation: '' })).toBe(true);
    });
});

describe('canSubmitDeletion — Google-only accounts', () => {
    const account = { hasPassword: false, phrase: 'DELETE' };

    it('stays disabled until the phrase matches', () => {
        expect(canSubmitDeletion({ ...account, confirmation: '' })).toBe(false);
        expect(canSubmitDeletion({ ...account, confirmation: 'DELET' })).toBe(false);
        expect(canSubmitDeletion({ ...account, confirmation: 'DELETE' })).toBe(true);
    });

    it('is never satisfied by a password it cannot check', () => {
        // There is no hash to compare against, so a typed password here proves
        // nothing at all.
        expect(canSubmitDeletion({ ...account, password: 'hunter2', confirmation: '' })).toBe(
            false
        );
    });
});

describe('canSubmitDeletion — double submission', () => {
    it('refuses while a delete is already in flight', () => {
        // Otherwise a second tap during the request sends a second delete.
        expect(
            canSubmitDeletion({ hasPassword: true, password: 'hunter2', submitting: true })
        ).toBe(false);
        expect(
            canSubmitDeletion({
                hasPassword: false,
                phrase: 'DELETE',
                confirmation: 'DELETE',
                submitting: true,
            })
        ).toBe(false);
    });
});

describe('canSubmitDeletion — defaults', () => {
    it('refuses when called with nothing', () => {
        expect(canSubmitDeletion()).toBe(false);
        expect(canSubmitDeletion({})).toBe(false);
    });
});
