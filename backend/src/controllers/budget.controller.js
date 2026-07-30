const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const getBudget = async (req, res) => {
    const { month, year } = req.query;

    if (!month || !year) {
        return res.status(400).json({ error: 'Month and year are required' });
    }

    try {
        const budget = await prisma.budget.findUnique({
            where: {
                userId_month_year: {
                    userId: req.user.id,
                    month: parseInt(month),
                    year: parseInt(year),
                },
            },
        });
        res.json(budget || { amount: 0 });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch budget' });
    }
};

const setBudget = async (req, res) => {
    const { amount, month, year } = req.body;

    try {
        const budget = await prisma.budget.upsert({
            where: {
                userId_month_year: {
                    userId: req.user.id,
                    month: parseInt(month),
                    year: parseInt(year),
                },
            },
            update: { amount: parseFloat(amount) },
            create: {
                userId: req.user.id,
                month: parseInt(month),
                year: parseInt(year),
                amount: parseFloat(amount),
            },
        });
        res.json(budget);
    } catch (error) {
        res.status(500).json({ error: 'Failed to set budget' });
    }
};

module.exports = { getBudget, setBudget };
