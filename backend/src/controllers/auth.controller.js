const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const prisma = require('../lib/prisma');
const { avatarPublicUrl, deleteAvatarFile } = require('../middleware/upload');
const { sendPasswordResetEmail } = require('../services/email');
const {
    TOKEN_TTL_MINUTES,
    createResetToken,
    hashResetToken,
    looksLikeResetToken,
    passwordProblem,
} = require('../lib/passwordReset');

// Everything the app is allowed to know about an account, in one place so a
// new profile field cannot reach one route's response and miss another's.
//
// The hash is selected but never returned: toPublicUser reduces it to a single
// boolean, which is what tells the delete screen to ask for a password rather
// than a typed phrase — an account created through Google has no password and
// could never satisfy one. Every route that selects this MUST answer through
// toPublicUser; a test asserts the hash cannot survive that trip.
const PUBLIC_USER = { id: true, email: true, name: true, avatarUrl: true, password: true };

const toPublicUser = (user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    hasPassword: typeof user.password === 'string' && user.password.length > 0,
});

// Absent when Google sign-in has not been configured. The route below answers
// 503 in that case rather than failing in a way the app has to guess at.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// Seeded for every new account. Without these a fresh user has no category to
// pick on the Add Expense screen, and cannot record anything at all.
const DEFAULT_CATEGORIES = [
    { name: 'Food & Dining', color: '#C2703D', icon: 'utensils' },
    { name: 'Transport', color: '#3D7EA6', icon: 'car' },
    { name: 'Bills & Utilities', color: '#A6453D', icon: 'receipt' },
    { name: 'Shopping', color: '#7A5AA6', icon: 'shopping-bag' },
    { name: 'Health', color: '#2E7D5B', icon: 'heart-pulse' },
    { name: 'Entertainment', color: '#B5527E', icon: 'clapperboard' },
    { name: 'Education', color: '#3D8FA6', icon: 'graduation-cap' },
    { name: 'Other', color: '#7B8785', icon: 'circle-dashed' },
];

// The stamp every token carries a copy of. Null for an account that has never
// had a password — which keeps tokens issued before this existed valid, so
// deploying it does not sign the whole userbase out.
const passwordStamp = (user) =>
    user?.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : null;

// An hour was short enough that the app asked for the password again during
// normal use, and there is no refresh token to soften that.
//
// pwdAt is what makes a reset able to end a session. A JWT cannot be recalled
// once signed, so instead each one states which password it was minted
// against, and the middleware refuses any token whose answer no longer matches
// the account.
const signToken = (user) =>
    jwt.sign({ id: user.id, pwdAt: passwordStamp(user) }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

const register = async (req, res) => {
    const { email, password, name } = req.body;

    if (typeof email !== 'string' || email.trim() === '') {
        return res.status(400).json({ error: 'Email is required' });
    }

    // The one password rule, shared with reset and change so the three cannot
    // drift into disagreeing about what a password is.
    const problem = passwordProblem(password);
    if (problem) {
        return res.status(400).json({ error: problem });
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
        const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existingUser) {
            // Deliberately unlogged. This used to print the address, which put
            // an email in production stdout every time someone mistyped their
            // way into an existing account.
            return res.status(400).json({ error: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Nested create runs in one transaction, so an account never exists
        // without its starter categories.
        const user = await prisma.user.create({
            data: {
                email: normalizedEmail,
                password: hashedPassword,
                name,
                categories: { create: DEFAULT_CATEGORIES },
            },
        });

        res.status(201).json({
            user: toPublicUser(user),
            token: signToken(user),
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
};

const login = async (req, res) => {
    const { email, password } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: 'Invalid credentials' });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: email.trim().toLowerCase() },
        });
        // None of the three failures below is logged. They used to print the
        // address that failed, which is a record of who tried to sign in and
        // when, written to production stdout, for no diagnostic gain — the
        // status code already says a login was refused.
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // An account created through Google has no password to compare. Saying
        // so would confirm the address is registered, so it fails like any
        // other wrong credential.
        if (!user.password) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        res.json({
            user: toPublicUser(user),
            token: signToken(user),
        });
    } catch (error) {
        res.status(500).json({ error: 'Something went wrong' });
    }
};

// Exchanges a Google ID token for one of ours. The token is verified against
// Google's public keys server-side: anything the app sends could have been
// crafted by whoever holds the device, so nothing in it is trusted until then.
const google = async (req, res) => {
    if (!googleClient) {
        return res.status(503).json({ error: 'Google sign-in is not available right now.' });
    }

    const { idToken } = req.body;

    if (typeof idToken !== 'string' || idToken.trim() === '') {
        return res.status(400).json({ error: 'Missing Google token' });
    }

    let payload;
    try {
        const ticket = await googleClient.verifyIdToken({
            idToken,
            // Rejects a token minted for someone else's app, which is otherwise
            // a perfectly valid Google token.
            audience: GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
    } catch (error) {
        console.warn('[AUTH GOOGLE 401] Token rejected:', error.message);
        return res.status(401).json({ error: 'Could not verify that Google account' });
    }

    // Some account types carry an address Google has not confirmed. Accepting
    // one would hand over any account whose email a stranger can claim.
    if (!payload || !payload.email || payload.email_verified === false) {
        return res.status(401).json({ error: 'That Google account has no verified email' });
    }

    const email = payload.email.toLowerCase();

    try {
        let user = await prisma.user.findUnique({ where: { googleId: payload.sub } });

        if (!user) {
            const existing = await prisma.user.findUnique({ where: { email } });

            if (existing) {
                // Same person arriving a second way. Linking beats refusing:
                // otherwise an account made with a password can never be opened
                // with the Google button on the same address.
                user = await prisma.user.update({
                    where: { id: existing.id },
                    data: {
                        googleId: payload.sub,
                        name: existing.name || payload.name || null,
                    },
                });
            } else {
                user = await prisma.user.create({
                    data: {
                        email,
                        googleId: payload.sub,
                        name: payload.name || null,
                        categories: { create: DEFAULT_CATEGORIES },
                    },
                });
            }
        }

        res.json({
            user: toPublicUser(user),
            token: signToken(user),
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
};

// Lets the client verify a stored token is still good on app start, and get
// fresh profile data back in the same round trip.
const me = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: PUBLIC_USER,
        });

        // Token still parses, but the account behind it is gone.
        if (!user) {
            return res.status(401).json({ error: 'Account no longer exists' });
        }

        res.json({ user: toPublicUser(user) });
    } catch (error) {
        res.status(500).json({ error: 'Something went wrong' });
    }
};

// The only editable field today is the display name. Email is identity —
// changing it would need re-verification — so it stays read-only here.
const updateProfile = async (req, res) => {
    const { name } = req.body;

    if (typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ error: 'Name is required' });
    }

    const trimmed = name.trim();

    if (trimmed.length > 60) {
        return res.status(400).json({ error: 'Name must be 60 characters or fewer' });
    }

    try {
        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: { name: trimmed },
            select: PUBLIC_USER,
        });

        res.json({ user: toPublicUser(user) });
    } catch (error) {
        // Token still parses, but the account behind it is gone.
        if (error.code === 'P2025') {
            return res.status(401).json({ error: 'Account no longer exists' });
        }
        console.error(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
};

// The file is already on disk by the time this runs — multer streams it there
// before the route body executes.
const setAvatar = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image received' });
    }

    const avatarUrl = avatarPublicUrl(req.file.filename);

    try {
        const previous = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { avatarUrl: true },
        });

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: { avatarUrl },
            select: PUBLIC_USER,
        });

        // Only once the row points at the replacement. The other order leaves
        // an account pointing at a photo that is no longer on disk.
        deleteAvatarFile(previous?.avatarUrl);

        res.json({ user: toPublicUser(user) });
    } catch (error) {
        // The row still points at the old photo, so this upload is an orphan.
        deleteAvatarFile(avatarUrl);

        if (error.code === 'P2025') {
            return res.status(401).json({ error: 'Account no longer exists' });
        }
        console.error(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
};

const removeAvatar = async (req, res) => {
    try {
        const previous = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { avatarUrl: true },
        });

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: { avatarUrl: null },
            select: PUBLIC_USER,
        });

        deleteAvatarFile(previous?.avatarUrl);

        res.json({ user: toPublicUser(user) });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(401).json({ error: 'Account no longer exists' });
        }
        console.error(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
};

// Irreversible, and scoped entirely by the token. The account comes from
// req.user.id; nothing in the body, query or params can widen it or point it
// at somebody else, which is the only reason this endpoint is safe to expose
// at all.
const deleteAccount = async (req, res) => {
    const userId = req.user.id;

    try {
        const account = await prisma.user.findUnique({
            where: { id: userId },
            select: { password: true, avatarUrl: true },
        });

        // A valid token whose account is already gone means this has run
        // before. Answering success rather than an error makes the call
        // idempotent: the state the caller asked for is the state that holds.
        if (!account) {
            return res.json({ deleted: true });
        }

        // Re-authentication wherever it is possible. An account created
        // through Google has no password to check — demanding one would lock
        // those users out of deleting their own data — so the app guards that
        // case with a typed confirmation instead. See the report for what that
        // does and does not protect against.
        if (account.password) {
            const { password } = req.body || {};

            if (typeof password !== 'string' || password.length === 0) {
                return res
                    .status(400)
                    .json({ error: 'Password is required to delete this account' });
            }

            const matches = await bcrypt.compare(password, account.password);

            if (!matches) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
        }

        // Read before the row goes, or the path goes with it.
        const { avatarUrl } = account;

        // Nothing in this schema cascades except a share to its own bill, and
        // that is deliberate: deleteCategory refuses with a 409 to remove a
        // category that still has expenses, and an onDelete: Cascade from
        // Expense to Category would quietly undo that guard for every caller,
        // not just this one. So the rows go explicitly, in foreign-key order,
        // inside a single transaction that removes the whole account or none
        // of it.
        //
        // The group tables lead, because a shared expense points at both an
        // Expense and a Category and would hold either of them in place. They
        // are reached through their group rather than by a userId of their own
        // — only ExpenseGroup carries one — which is exactly the relation
        // filter every group route uses, and it is what keeps this from
        // touching another account's rows.
        //
        // Written now rather than with the endpoints that will fill these
        // tables: the migration is additive, so every clause below is a no-op
        // until it is applied, and the alternative is an account deletion that
        // silently starts leaving group data behind the day it is.
        await prisma.$transaction([
            prisma.settlement.deleteMany({ where: { group: { userId } } }),
            prisma.sharedExpenseShare.deleteMany({
                where: { sharedExpense: { group: { userId } } },
            }),
            prisma.sharedExpense.deleteMany({ where: { group: { userId } } }),
            prisma.groupMember.deleteMany({ where: { group: { userId } } }),
            prisma.expenseGroup.deleteMany({ where: { userId } }),
            prisma.expense.deleteMany({ where: { userId } }),
            prisma.budget.deleteMany({ where: { userId } }),
            prisma.category.deleteMany({ where: { userId } }),
            // Reset tokens cascade on the foreign key as well; clearing them
            // here keeps the order explicit and testable rather than relying
            // on a database behaviour nothing in this file states.
            prisma.passwordResetToken.deleteMany({ where: { userId } }),
            prisma.user.delete({ where: { id: userId } }),
        ]);

        // After the commit, never before. A failed unlink leaves an orphaned
        // file, which is clutter someone can sweep later; unlinking first and
        // then rolling back would leave a live account whose photo had
        // silently vanished, which the user cannot recover from at all.
        deleteAvatarFile(avatarUrl);

        res.json({ deleted: true });
    } catch (error) {
        // The row can disappear between the read and the transaction if two
        // calls arrive together. That is the outcome that was asked for.
        if (error.code === 'P2025') {
            return res.json({ deleted: true });
        }

        // Code only. This request carries a password, and the account it names
        // is the one thing worth not writing down.
        console.error('Account deletion failed', error.code || 'unknown');
        res.status(500).json({ error: 'Something went wrong' });
    }
};

// One sentence, returned to everybody. An address that has an account, an
// address that does not, a Google-only account with no password to reset, and
// a database that is on fire all produce this and nothing else — because any
// difference between them is a way to ask the server whether a person has a
// WealthTrack account, and that is nobody's business to be able to ask.
const GENERIC_RESET_RESPONSE = {
    message: 'If an account exists for that email, reset instructions have been sent.',
};

// Deliberately vague, and the same for all four ways a link can fail: never
// issued, already spent, expired, or belonging to an account since deleted.
const INVALID_TOKEN_MESSAGE = 'That reset link is invalid or has expired';

const forgotPassword = async (req, res) => {
    const { email } = req.body || {};

    // Normalised exactly as register and login do it, or a reset request for
    // "Juan@Example.com " would silently miss the account it belongs to.
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    // 254 is the longest an address can be. Anything longer is not a typo, and
    // it still gets the same answer as everything else.
    if (normalizedEmail === '' || normalizedEmail.length > 254) {
        return res.json(GENERIC_RESET_RESPONSE);
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: normalizedEmail },
            select: { id: true, password: true },
        });

        // A Google-only account has no password to reset. Sending it a link
        // would be pointless; saying so would confirm the address is
        // registered and reveal how it signs in.
        if (user?.password) {
            const { token, tokenHash, expiresAt } = createResetToken();

            await prisma.$transaction([
                // Asking again retires the earlier link. Two live links to one
                // account doubles the window without helping anyone.
                prisma.passwordResetToken.updateMany({
                    where: { userId: user.id, consumedAt: null },
                    data: { consumedAt: new Date() },
                }),
                prisma.passwordResetToken.create({
                    data: { userId: user.id, tokenHash, expiresAt },
                }),
            ]);

            const appUrl = process.env.PUBLIC_APP_URL;

            if (appUrl) {
                // Whitelisted, never echoed. The reset page is opened in a
                // browser well away from the app's language setting, so the
                // one the user was actually reading travels with the link.
                const requested = req.body?.lang;
                const lang = ['en', 'fil', 'ceb'].includes(requested) ? requested : 'en';
                const resetUrl = `${appUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}&lang=${lang}`;

                // Local development only, off unless asked for by name. It is
                // the one way to walk the flow end to end before an email
                // provider exists, and it can never fire in production.
                if (process.env.NODE_ENV !== 'production' && process.env.PASSWORD_RESET_DEBUG === 'true') {
                    console.log('[dev] password reset link:', resetUrl);
                }

                // Not awaited. The response must not take longer for an
                // address that has an account than for one that does not, and
                // waiting on a mail provider is the largest difference there
                // would be. Failures are logged inside the service.
                sendPasswordResetEmail({
                    to: normalizedEmail,
                    resetUrl,
                    minutes: TOKEN_TTL_MINUTES,
                }).catch(() => {});
            }
        }

        res.json(GENERIC_RESET_RESPONSE);
    } catch (error) {
        // Even this answers the same way. A 500 here would mean "that address
        // exists but something broke", which is the disclosure the endpoint is
        // built to avoid. Code only: never the address.
        console.error('[auth] forgot-password failed', error?.code || 'unknown');
        res.json(GENERIC_RESET_RESPONSE);
    }
};

const resetPassword = async (req, res) => {
    const { token, newPassword } = req.body || {};

    // Shape first, so a flood of junk does not become a flood of queries.
    if (!looksLikeResetToken(token)) {
        return res.status(400).json({ error: INVALID_TOKEN_MESSAGE });
    }

    const problem = passwordProblem(newPassword);
    if (problem) {
        return res.status(400).json({ error: problem });
    }

    try {
        const record = await prisma.passwordResetToken.findUnique({
            where: { tokenHash: hashResetToken(token) },
            select: { id: true, userId: true, expiresAt: true, consumedAt: true },
        });

        // Never issued, already spent, or past its window — all the same
        // sentence. A token whose account has since been deleted has been
        // removed by the cascade, so it lands here too.
        if (!record || record.consumedAt || record.expiresAt.getTime() <= Date.now()) {
            return res.status(400).json({ error: INVALID_TOKEN_MESSAGE });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const changedAt = new Date();

        // One interactive transaction so the token is spent, the password is
        // written and the other links are retired together or not at all.
        const outcome = await prisma.$transaction(async (tx) => {
            // The guard is the whole single-use mechanism: the row is only
            // claimed if it is still unclaimed, so two requests racing on the
            // same link produce one winner and one count of zero, decided by
            // the database rather than by whichever read happened first.
            const claimed = await tx.passwordResetToken.updateMany({
                where: { id: record.id, consumedAt: null },
                data: { consumedAt: changedAt },
            });

            if (claimed.count === 0) {
                return 'already_used';
            }

            await tx.user.update({
                where: { id: record.userId },
                // Stamping the change is what invalidates every session that
                // was open before it — including whoever the reset was
                // protecting the account from.
                data: { password: hashedPassword, passwordChangedAt: changedAt },
            });

            // Any other outstanding link for this account dies with it.
            await tx.passwordResetToken.updateMany({
                where: { userId: record.userId, consumedAt: null },
                data: { consumedAt: changedAt },
            });

            return 'reset';
        });

        if (outcome !== 'reset') {
            return res.status(400).json({ error: INVALID_TOKEN_MESSAGE });
        }

        // No token is issued here. Signing someone in because they proved
        // control of a mailbox is a weaker sign-in than the one they now have
        // a password for, so they go and use it.
        res.json({ reset: true });
    } catch (error) {
        console.error('[auth] reset-password failed', error?.code || 'unknown');
        res.status(500).json({ error: 'Something went wrong' });
    }
};

// Serves both changing a password and setting the first one. Which of the two
// it is comes from the account, not from the request: an account with a hash
// must prove the old password, and an account without one cannot, because
// there is nothing to prove it against.
const changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    const userId = req.user.id;

    const problem = passwordProblem(newPassword);
    if (problem) {
        return res.status(400).json({ error: problem });
    }

    try {
        const account = await prisma.user.findUnique({
            where: { id: userId },
            select: { ...PUBLIC_USER, passwordChangedAt: true },
        });

        if (!account) {
            return res.status(401).json({ error: 'Account no longer exists' });
        }

        if (account.password) {
            if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
                return res.status(400).json({ error: 'Current password is required' });
            }

            const matches = await bcrypt.compare(currentPassword, account.password);
            if (!matches) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }

            // Changing a password to itself leaves the user believing they
            // have rotated a credential they have not.
            const unchanged = await bcrypt.compare(newPassword, account.password);
            if (unchanged) {
                return res
                    .status(400)
                    .json({ error: 'New password must be different from the current one' });
            }
        }
        // A Google-only account has no old password to demand. The live
        // session is the proof, and the app asks for this deliberately behind
        // a screen that says it is setting one rather than changing one.

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const changedAt = new Date();

        const updated = await prisma.$transaction(async (tx) => {
            const user = await tx.user.update({
                where: { id: userId },
                data: { password: hashedPassword, passwordChangedAt: changedAt },
                select: { ...PUBLIC_USER, passwordChangedAt: true },
            });

            // A password just changed by its owner also retires any reset link
            // sitting unread in their mailbox.
            await tx.passwordResetToken.updateMany({
                where: { userId, consumedAt: null },
                data: { consumedAt: changedAt },
            });

            return user;
        });

        // Every session opened before this moment is now refused, and that
        // includes the one that just made the change. A fresh token keeps the
        // person who did it signed in while everyone else is turned out.
        res.json({ user: toPublicUser(updated), token: signToken(updated) });
    } catch (error) {
        if (error?.code === 'P2025') {
            return res.status(401).json({ error: 'Account no longer exists' });
        }
        console.error('[auth] change-password failed', error?.code || 'unknown');
        res.status(500).json({ error: 'Something went wrong' });
    }
};

module.exports = {
    register,
    login,
    google,
    me,
    updateProfile,
    setAvatar,
    removeAvatar,
    deleteAccount,
    forgotPassword,
    resetPassword,
    changePassword,
    // Exported for the test that pins the password hash inside this module.
    toPublicUser,
};
