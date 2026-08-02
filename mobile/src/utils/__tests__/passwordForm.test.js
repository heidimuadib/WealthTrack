import {
    passwordFormProblem,
    canSubmitPasswordChange,
    MIN_PASSWORD_LENGTH,
} from '../passwordForm';

const withPassword = {
    hasPassword: true,
    currentPassword: 'old-password',
    newPassword: 'a-good-password',
    confirmPassword: 'a-good-password',
};

const googleOnly = {
    hasPassword: false,
    newPassword: 'a-good-password',
    confirmPassword: 'a-good-password',
};

describe('passwordFormProblem — an account with a password', () => {
    it('accepts a well-formed change', () => {
        expect(passwordFormProblem(withPassword)).toBeNull();
    });

    it('asks for the current password first', () => {
        expect(passwordFormProblem({ ...withPassword, currentPassword: '' })).toBe(
            'server.currentPasswordRequired'
        );
    });

    it('refuses a new password under the minimum', () => {
        expect(
            passwordFormProblem({
                ...withPassword,
                newPassword: 'short',
                confirmPassword: 'short',
            })
        ).toBe('server.passwordTooShort');
        expect(MIN_PASSWORD_LENGTH).toBe(8);
    });

    it('refuses a mismatched confirmation', () => {
        expect(
            passwordFormProblem({ ...withPassword, confirmPassword: 'a-good-passwerd' })
        ).toBe('password.mismatch');
    });

    it('mentions the mismatch before the reuse', () => {
        // Someone who mistyped the confirmation should hear about that, not
        // be told their password is unchanged.
        expect(
            passwordFormProblem({
                ...withPassword,
                newPassword: 'old-password',
                confirmPassword: 'old-passwerd',
            })
        ).toBe('password.mismatch');
    });

    it('refuses a change to the same password', () => {
        expect(
            passwordFormProblem({
                ...withPassword,
                newPassword: 'old-password',
                confirmPassword: 'old-password',
            })
        ).toBe('password.sameAsOld');
    });
});

describe('passwordFormProblem — a Google-only account', () => {
    it('accepts a first password with nothing to prove', () => {
        expect(passwordFormProblem(googleOnly)).toBeNull();
    });

    it('never asks for a current password it could not check', () => {
        // Demanding one would leave these accounts unable to ever have a
        // password at all.
        expect(passwordFormProblem({ ...googleOnly, currentPassword: '' })).toBeNull();
    });

    it('still enforces length and confirmation', () => {
        expect(
            passwordFormProblem({ ...googleOnly, newPassword: 'short', confirmPassword: 'short' })
        ).toBe('server.passwordTooShort');
        expect(passwordFormProblem({ ...googleOnly, confirmPassword: 'other-password' })).toBe(
            'password.mismatch'
        );
    });
});

describe('canSubmitPasswordChange', () => {
    it('waits for the fields the account actually needs', () => {
        expect(canSubmitPasswordChange({ hasPassword: true, newPassword: 'x', confirmPassword: 'x' })).toBe(
            false
        );
        expect(canSubmitPasswordChange({ ...withPassword })).toBe(true);
        expect(canSubmitPasswordChange({ ...googleOnly })).toBe(true);
    });

    it('stays enabled for a filled-in but invalid form, so the reason can be shown', () => {
        // A disabled button that will not say why is worse than one that
        // explains the problem when pressed.
        const mismatched = { ...withPassword, confirmPassword: 'different' };
        expect(canSubmitPasswordChange(mismatched)).toBe(true);
        expect(passwordFormProblem(mismatched)).toBe('password.mismatch');
    });

    it('refuses while a change is already in flight', () => {
        expect(canSubmitPasswordChange({ ...withPassword, submitting: true })).toBe(false);
    });

    it('refuses when called with nothing', () => {
        expect(canSubmitPasswordChange()).toBe(false);
        expect(canSubmitPasswordChange({})).toBe(false);
    });
});
