// The rules the change-password form applies before anything leaves the
// device. The server enforces all of these again — it has to, since nothing
// stops a request being made without the app — so these exist to answer in the
// user's own language, immediately, instead of after a round trip that tells
// them "Password must be at least 8 characters" in English.
//
// Returns a translation key rather than a sentence, so the screen stays the
// only place that knows how to say things.

// Matches the server's rule exactly. Two different minimums would mean a
// password the app accepts and the API refuses.
export const MIN_PASSWORD_LENGTH = 8;

export const passwordFormProblem = ({
    hasPassword,
    currentPassword = '',
    newPassword = '',
    confirmPassword = '',
} = {}) => {
    // Only an account that has a password can be asked to prove it.
    if (hasPassword && currentPassword.length === 0) {
        return 'server.currentPasswordRequired';
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return 'server.passwordTooShort';
    }

    // Checked before the "same as old" rule: someone who mistyped the
    // confirmation should hear about that, not about reuse.
    if (newPassword !== confirmPassword) {
        return 'password.mismatch';
    }

    if (hasPassword && currentPassword === newPassword) {
        return 'password.sameAsOld';
    }

    return null;
};

// Whether the button does anything, which is a lower bar than whether the form
// is correct: a disabled button that will not say why is worse than one that
// explains the problem when pressed. `submitting` is in here rather than only
// on the button because a second tap during the request would send a second
// change.
export const canSubmitPasswordChange = ({
    hasPassword,
    currentPassword = '',
    newPassword = '',
    confirmPassword = '',
    submitting = false,
} = {}) => {
    if (submitting) {
        return false;
    }

    if (hasPassword && currentPassword.length === 0) {
        return false;
    }

    return newPassword.length > 0 && confirmPassword.length > 0;
};
