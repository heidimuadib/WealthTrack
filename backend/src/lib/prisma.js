const { PrismaClient } = require('@prisma/client');
const { MONEY_MODELS } = require('./moneyModels');

// One client for the whole process. Each controller used to construct its own,
// which meant four connection pools competing for the same database.
//
// The extension exists because money is stored as Decimal. Prisma hands those
// back as Decimal objects, and JSON.stringify turns a Decimal into a *string* —
// so `/expenses` would answer with "500" instead of 500, and the app's
// `expenses.reduce((sum, e) => sum + e.amount, 0)` would concatenate its way to
// "0500" rather than adding. Converting on read keeps the API answering in
// numbers, exactly as it did before the column changed type.
//
// The conversion is lossless for every amount this column can hold: Decimal(12,2)
// tops out at 9,999,999,999.99, and a double represents values that size exactly.
// The database still stores and aggregates in exact decimal — only the JSON
// boundary is numeric.
const toNumber = (value) => (value === null || value === undefined ? value : value.toNumber());

// Every model with an `amount` column, listed rather than spelled out one block
// at a time. The conversion is identical for all of them, and writing it once
// means a new money-carrying model cannot be added while quietly forgetting to
// convert it — which is a bug that shows up far from its cause, as a total that
// reads "0500" instead of 500. A test holds the list against the schema.
const moneyResultExtension = Object.fromEntries(
    MONEY_MODELS.map((model) => [
        model,
        {
            amount: {
                needs: { amount: true },
                compute: (row) => toNumber(row.amount),
            },
        },
    ])
);

const prisma = new PrismaClient().$extends({ result: moneyResultExtension });

module.exports = prisma;
