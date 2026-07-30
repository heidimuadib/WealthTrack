const prisma = require('../lib/prisma');

// Local-time month boundaries: an expense belongs to the month the user saw on
// their calendar, not the UTC month.
const monthRange = (month, year) => ({
    gte: new Date(year, month - 1, 1),
    lt: new Date(year, month, 1),
});

const parseId = (value) => {
    const id = parseInt(value, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
};

const parseAmount = (value) => {
    const amount = parseFloat(value);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
};

// Confirms the category exists AND belongs to the caller, so a user cannot
// attach their expenses to someone else's category.
const ownsCategory = async (categoryId, userId) => {
    const category = await prisma.category.findFirst({
        where: { id: categoryId, userId },
        select: { id: true },
    });
    return category !== null;
};

const getExpenses = async (req, res) => {
    const { month, year } = req.query;

    try {
        const where = { userId: req.user.id };

        // Both are optional; without them this returns the full history.
        if (month && year) {
            const m = parseInt(month, 10);
            const y = parseInt(year, 10);

            if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y)) {
                return res.status(400).json({ error: 'Invalid month or year' });
            }

            where.date = monthRange(m, y);
        }

        const expenses = await prisma.expense.findMany({
            where,
            include: { category: true },
            orderBy: { date: 'desc' },
        });
        res.json(expenses);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch expenses' });
    }
};

const createExpense = async (req, res) => {
    const { amount, categoryId, date, notes } = req.body;

    const parsedAmount = parseAmount(amount);
    if (parsedAmount === null) {
        return res.status(400).json({ error: 'Amount must be a number greater than 0' });
    }

    const parsedCategoryId = parseId(categoryId);
    if (parsedCategoryId === null) {
        return res.status(400).json({ error: 'A valid category is required' });
    }

    const parsedDate = date ? new Date(date) : new Date();
    if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date' });
    }

    try {
        if (!(await ownsCategory(parsedCategoryId, req.user.id))) {
            return res.status(404).json({ error: 'Category not found' });
        }

        const expense = await prisma.expense.create({
            data: {
                amount: parsedAmount,
                categoryId: parsedCategoryId,
                date: parsedDate,
                notes,
                userId: req.user.id,
            },
            include: { category: true },
        });
        res.status(201).json(expense);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create expense' });
    }
};

const updateExpense = async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: 'Invalid expense id' });
    }

    const { amount, categoryId, date, notes } = req.body;
    const data = {};

    if (amount !== undefined) {
        const parsedAmount = parseAmount(amount);
        if (parsedAmount === null) {
            return res.status(400).json({ error: 'Amount must be a number greater than 0' });
        }
        data.amount = parsedAmount;
    }

    if (categoryId !== undefined) {
        const parsedCategoryId = parseId(categoryId);
        if (parsedCategoryId === null) {
            return res.status(400).json({ error: 'A valid category is required' });
        }
        data.categoryId = parsedCategoryId;
    }

    if (date !== undefined) {
        const parsedDate = new Date(date);
        if (Number.isNaN(parsedDate.getTime())) {
            return res.status(400).json({ error: 'Invalid date' });
        }
        data.date = parsedDate;
    }

    if (notes !== undefined) {
        data.notes = notes;
    }

    if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }

    try {
        if (data.categoryId && !(await ownsCategory(data.categoryId, req.user.id))) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Scoping to userId is what prevents one user from editing another's
        // expense by guessing a sequential id.
        const { count } = await prisma.expense.updateMany({
            where: { id, userId: req.user.id },
            data,
        });

        if (count === 0) {
            return res.status(404).json({ error: 'Expense not found' });
        }

        const expense = await prisma.expense.findUnique({
            where: { id },
            include: { category: true },
        });
        res.json(expense);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update expense' });
    }
};

const deleteExpense = async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: 'Invalid expense id' });
    }

    try {
        const { count } = await prisma.expense.deleteMany({
            where: { id, userId: req.user.id },
        });

        if (count === 0) {
            return res.status(404).json({ error: 'Expense not found' });
        }

        res.json({ message: 'Expense deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete expense' });
    }
};

module.exports = { getExpenses, createExpense, updateExpense, deleteExpense };
