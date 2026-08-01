const prisma = require('../lib/prisma');

// Totals are summed by Postgres over the Decimal column, not by JavaScript
// over floats — the README's known gap about client-side money arithmetic is
// exactly what this endpoint exists to close. Numbers leave here as JSON
// numbers like the rest of the API.
const summary = async (req, res) => {
    const year = parseInt(req.query.year, 10);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: 'Invalid year' });
    }

    // Local-time year boundaries, mirroring monthRange in the expense
    // controller so a report month always agrees with that month's screen.
    const from = new Date(year, 0, 1);
    const to = new Date(year + 1, 0, 1);
    const userId = req.user.id;

    try {
        const [monthRows, categoryRows] = await Promise.all([
            prisma.$queryRaw`
                SELECT EXTRACT(MONTH FROM "date")::int AS month,
                       SUM("amount") AS total
                FROM "Expense"
                WHERE "userId" = ${userId} AND "date" >= ${from} AND "date" < ${to}
                GROUP BY 1
            `,
            prisma.$queryRaw`
                SELECT c."id", c."name", c."color", SUM(e."amount") AS total
                FROM "Expense" e
                JOIN "Category" c ON c."id" = e."categoryId"
                WHERE e."userId" = ${userId} AND e."date" >= ${from} AND e."date" < ${to}
                GROUP BY c."id", c."name", c."color"
                ORDER BY total DESC
            `,
        ]);

        const byMonth = new Map(monthRows.map((row) => [row.month, Number(row.total)]));
        // All twelve months, zero-filled — the chart draws a full year, and
        // "no row" and "spent nothing" mean the same thing to it.
        const months = Array.from({ length: 12 }, (_, index) => ({
            month: index + 1,
            total: byMonth.get(index + 1) || 0,
        }));

        const total = months.reduce((sum, item) => sum + item.total, 0);

        const categories = categoryRows.map((row) => ({
            id: row.id,
            name: row.name,
            color: row.color,
            total: Number(row.total),
            share: total > 0 ? Number(row.total) / total : 0,
        }));

        res.json({ year, total, months, categories });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to build the report' });
    }
};

module.exports = { summary };
