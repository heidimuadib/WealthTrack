const prisma = require('../lib/prisma');

// Raised when the [userId, name] unique constraint rejects a write. The user
// already has a category by that name, which is worth saying plainly rather
// than reporting as a server fault.
const isDuplicateName = (error) => error?.code === 'P2002';

const parseId = (value) => {
    const id = parseInt(value, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
};

const getCategories = async (req, res) => {
    try {
        const categories = await prisma.category.findMany({
            where: { userId: req.user.id },
            orderBy: { name: 'asc' },
        });
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
};

const createCategory = async (req, res) => {
    const { name, color, icon } = req.body;

    if (typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ error: 'Category name is required' });
    }

    try {
        const category = await prisma.category.create({
            data: {
                name: name.trim(),
                color,
                icon,
                userId: req.user.id,
            },
        });
        res.status(201).json(category);
    } catch (error) {
        if (isDuplicateName(error)) {
            return res.status(409).json({ error: 'You already have a category with that name.' });
        }
        res.status(500).json({ error: 'Failed to create category' });
    }
};

const updateCategory = async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: 'Invalid category id' });
    }

    const { name, color, icon } = req.body;
    const data = {};

    if (name !== undefined) {
        if (typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: 'Category name is required' });
        }
        data.name = name.trim();
    }
    if (color !== undefined) {
        data.color = color;
    }
    if (icon !== undefined) {
        data.icon = icon;
    }

    if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }

    try {
        // Scoped to userId so one user cannot rename another's category.
        const { count } = await prisma.category.updateMany({
            where: { id, userId: req.user.id },
            data,
        });

        if (count === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        const category = await prisma.category.findUnique({ where: { id } });
        res.json(category);
    } catch (error) {
        if (isDuplicateName(error)) {
            return res.status(409).json({ error: 'You already have a category with that name.' });
        }
        res.status(500).json({ error: 'Failed to update category' });
    }
};

const deleteCategory = async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: 'Invalid category id' });
    }

    try {
        // Expense.categoryId is required, so a category still in use cannot be
        // removed without orphaning rows. Tell the client instead of 500-ing.
        const inUse = await prisma.expense.count({
            where: { categoryId: id, userId: req.user.id },
        });

        if (inUse > 0) {
            return res.status(409).json({
                error: `Cannot delete a category that still has ${inUse} expense(s).`,
            });
        }

        // Scoped to userId so one user cannot delete another's category.
        const { count } = await prisma.category.deleteMany({
            where: { id, userId: req.user.id },
        });

        if (count === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json({ message: 'Category deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete category' });
    }
};

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
