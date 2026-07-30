const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// A budget is addressed by (month, year), so both have to be real before they
// reach the compound unique key — parseInt('abc') yields NaN, which Prisma
// rejects with a 500 that tells the client nothing.
const parsePeriod = (month, year) => {
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);

    if (!Number.isInteger(m) || m < 1 || m > 12) {
        return { error: 'Month must be a number from 1 to 12' };
    }
    // Bounded so a typo cannot write a row that no month view will ever show.
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
        return { error: 'Year must be a number between 2000 and 2100' };
    }

    return { month: m, year: y };
};

// Zero is allowed — it is how a budget gets cleared.
const parseAmount = (value) => {
    const amount = parseFloat(value);
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
};

const getBudget = async (req, res) => {
    const period = parsePeriod(req.query.month, req.query.year);
    if (period.error) {
        return res.status(400).json({ error: period.error });
    }

    try {
        const budget = await prisma.budget.findUnique({
            where: {
                userId_month_year: {
                    userId: req.user.id,
                    month: period.month,
                    year: period.year,
                },
            },
        });
        res.json(budget || { amount: 0 });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch budget' });
    }
};

const setBudget = async (req, res) => {
    const period = parsePeriod(req.body.month, req.body.year);
    if (period.error) {
        return res.status(400).json({ error: period.error });
    }

    const amount = parseAmount(req.body.amount);
    if (amount === null) {
        return res.status(400).json({ error: 'Amount must be a number of zero or more' });
    }

    try {
        const budget = await prisma.budget.upsert({
            where: {
                userId_month_year: {
                    userId: req.user.id,
                    month: period.month,
                    year: period.year,
                },
            },
            update: { amount },
            create: {
                userId: req.user.id,
                month: period.month,
                year: period.year,
                amount,
            },
        });
        res.json(budget);
    } catch (error) {
        res.status(500).json({ error: 'Failed to set budget' });
    }
};

module.exports = { getBudget, setBudget };
