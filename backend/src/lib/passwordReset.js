const crypto = require('crypto');

// Token handling kept away from the controller so the rules can be tested as
// values in, values out — and so there is exactly one place that decides what
// a reset token is.

// 256 bits from the OS entropy pool. Guessing one is not a threat model at
// this size; the reason the window is short is the far more ordinary risk of a
// mailbox being read by someone else.
const TOKEN_BYTES = 32;
const TOKEN_TTL_MINUTES = 30;

// base64url has no characters that a mail client will helpfully turn into a
// link boundary, and none that need escaping in a query string.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,90}$/;

// SHA-256 rather than bcrypt, and deliberately. bcrypt is slow on purpose to
// make a low-entropy secret expensive to guess; this secret has 256 bits of
// entropy, so there is nothing to guess and the slowness would only be paid by
// the person clicking their own link. What matters here is that the database
// never holds anything that can be turned back into a working link.
const hashResetToken = (token) =>
    crypto.createHash('sha256').update(String(token)).digest('hex');

const createResetToken = (now = new Date()) => {
    const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');

    return {
        token,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(now.getTime() + TOKEN_TTL_MINUTES * 60 * 1000),
    };
};

// Cheap shape check before anything touches the database. A token of the wrong
// length or alphabet cannot be one we issued, so it is refused without a query
// — which also keeps a flood of junk from turning into a flood of lookups.
const looksLikeResetToken = (token) =>
    typeof token === 'string' && TOKEN_PATTERN.test(token);

// One rule, used by register, reset and change alike, so the three cannot
// drift into disagreeing about what a password is. The wording is the API's
// existing sentence, which the app already translates.
const MIN_PASSWORD_LENGTH = 8;

const passwordProblem = (password) => {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        return 'Password must be at least 8 characters';
    }

    return null;
};

module.exports = {
    TOKEN_TTL_MINUTES,
    MIN_PASSWORD_LENGTH,
    createResetToken,
    hashResetToken,
    looksLikeResetToken,
    passwordProblem,
};
