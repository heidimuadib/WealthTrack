const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const prisma = require('../lib/prisma');

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
            user: { id: user.id, email: user.email, name: user.name },
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
            user: { id: user.id, email: user.email, name: user.name },
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
            user: { id: user.id, email: user.email, name: user.name },
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
            select: { id: true, email: true, name: true },
        });

        // Token still parses, but the account behind it is gone.
        if (!user) {
            return res.status(401).json({ error: 'Account no longer exists' });
        }

        res.json({ user });
    } catch (error) {
        res.status(500).json({ error: 'Something went wrong' });
    }
};

module.exports = { register, login, google, me };
