const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const prisma = require('../lib/prisma');
const { avatarPublicUrl, deleteAvatarFile } = require('../middleware/upload');

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

// An hour was short enough that the app asked for the password again during
// normal use, and there is no refresh token to soften that.
const signToken = (user) =>
    jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

const register = async (req, res) => {
    const { email, password, name } = req.body;

    if (typeof email !== 'string' || email.trim() === '') {
        return res.status(400).json({ error: 'Email is required' });
    }

    if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
        const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existingUser) {
            console.warn(`[AUTH REGISTER 400] User already exists: ${normalizedEmail}`);
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
        if (!user) {
            console.warn(`[AUTH LOGIN 400] User not found: ${email}`);
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // An account created through Google has no password to compare. Saying
        // so would confirm the address is registered, so it fails like any
        // other wrong credential.
        if (!user.password) {
            console.warn(`[AUTH LOGIN 400] Password login on a Google-only account`);
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.warn(`[AUTH LOGIN 400] Wrong password for: ${email}`);
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

        // Nothing in this schema cascades, and that is deliberate:
        // deleteCategory refuses with a 409 to remove a category that still
        // has expenses, and an onDelete: Cascade from Expense to Category
        // would quietly undo that guard for every caller, not just this one.
        // So the rows go explicitly, in foreign-key order — expenses
        // reference categories, so they lead — inside a single transaction
        // that removes the whole account or none of it. Every clause is
        // scoped by userId, so no other account can be reached from here.
        await prisma.$transaction([
            prisma.expense.deleteMany({ where: { userId } }),
            prisma.budget.deleteMany({ where: { userId } }),
            prisma.category.deleteMany({ where: { userId } }),
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

module.exports = {
    register,
    login,
    google,
    me,
    updateProfile,
    setAvatar,
    removeAvatar,
    deleteAccount,
    // Exported for the test that pins the password hash inside this module.
    toPublicUser,
};
