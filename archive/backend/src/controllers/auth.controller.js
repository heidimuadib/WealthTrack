const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();

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

const signToken = (user) =>
    jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

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
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
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

module.exports = { register, login, me };
