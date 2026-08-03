// Every model carrying an `amount` column that Prisma returns as a Decimal.
//
// Kept in a module of its own rather than inline in prisma.js for one reason:
// requiring prisma.js constructs a PrismaClient, which needs a database URL and
// a generated client. The list is the thing worth testing — that it still
// matches the schema — and that test should not need either.
module.exports = {
    MONEY_MODELS: [
        'expense',
        'budget',
        'sharedExpense',
        'sharedExpenseShare',
        'settlement',
    ],
};
