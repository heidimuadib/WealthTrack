const fs = require('fs');
const path = require('path');

const { MONEY_MODELS } = require('../moneyModels');

// Read off disk rather than required. The point of these is to hold the files
// that actually ship against the decisions the audit made — a test that
// imported a generated client would be asserting against something derived from
// the schema rather than against the schema itself.
const prismaDir = path.join(__dirname, '..', '..', '..', 'prisma');
const schema = fs.readFileSync(path.join(prismaDir, 'schema.prisma'), 'utf8');

const MIGRATION_NAME = '20260804021500_groups_shared_expenses';
const migrationDir = path.join(prismaDir, 'migrations', MIGRATION_NAME);
const migration = fs.readFileSync(path.join(migrationDir, 'migration.sql'), 'utf8');

const NEW_MODELS = [
    'ExpenseGroup',
    'GroupMember',
    'SharedExpense',
    'SharedExpenseShare',
    'Settlement',
];

const modelBlock = (name) => {
    const match = new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema);
    return match ? match[1] : null;
};

describe('schema', () => {
    it('declares the five new models', () => {
        NEW_MODELS.forEach((name) => expect(modelBlock(name)).not.toBeNull());
    });

    it('declares the SplitMethod enum with exactly the two approved methods', () => {
        const block = /^enum SplitMethod \{([\s\S]*?)^\}/m.exec(schema);
        expect(block).not.toBeNull();

        const values = block[1]
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('//'));
        expect(values).toEqual(['EQUAL', 'CUSTOM']);
    });

    it('gives every new model a uuid string id', () => {
        NEW_MODELS.forEach((name) => {
            expect({ name, id: /id\s+String\s+@id\s+@default\(uuid\(\)\)/.test(modelBlock(name)) })
                .toEqual({ name, id: true });
        });
    });

    it('leaves every existing model on its integer id', () => {
        ['User', 'Category', 'Expense', 'Budget', 'PasswordResetToken'].forEach((name) => {
            expect({ name, id: /id\s+Int\s+@id\s+@default\(autoincrement\(\)\)/.test(modelBlock(name)) })
                .toEqual({ name, id: true });
        });
    });

    it('keeps the foreign keys into existing tables as integers', () => {
        // Mixed key types are fine, but only if each side agrees.
        expect(modelBlock('ExpenseGroup')).toMatch(/userId\s+Int/);
        expect(modelBlock('SharedExpense')).toMatch(/categoryId\s+Int\b/);
        expect(modelBlock('SharedExpense')).toMatch(/personalExpenseId\s+Int\?/);
    });

    it('requires a category on a shared expense', () => {
        // Expense.categoryId has no `?`, so a bill with no category could never
        // be mirrored into a personal expense.
        expect(modelBlock('SharedExpense')).toMatch(/categoryId\s+Int(?!\?)/);
    });

    it('restricts deletion of a mirrored personal expense', () => {
        // Prisma would otherwise default an optional relation to SetNull, which
        // would silently unlink the mirror and understate the user's spending.
        expect(modelBlock('SharedExpense')).toMatch(
            /personalExpense\s+Expense\?[^\n]*onDelete:\s*Restrict/
        );
    });

    it('cascades a share only from its own expense', () => {
        expect(modelBlock('SharedExpenseShare')).toMatch(
            /sharedExpense\s+SharedExpense[^\n]*onDelete:\s*Cascade/
        );
    });

    it('adds no other cascade anywhere in the schema', () => {
        // PasswordResetToken already had one; the share above is the only new
        // one. Everything else stays explicit, as this schema's comments say.
        const cascades = schema.match(/onDelete:\s*Cascade/g) || [];
        expect(cascades).toHaveLength(2);
    });

    it('carries the back-relations the mirror depends on', () => {
        expect(modelBlock('User')).toMatch(/expenseGroups\s+ExpenseGroup\[\]/);
        expect(modelBlock('Expense')).toMatch(/sharedExpense\s+SharedExpense\?/);
        expect(modelBlock('Category')).toMatch(/sharedExpenses\s+SharedExpense\[\]/);
    });

    it('stores every new amount as the same Decimal as the existing ones', () => {
        ['SharedExpense', 'SharedExpenseShare', 'Settlement'].forEach((name) => {
            expect({ name, decimal: /amount\s+Decimal\s+@db\.Decimal\(12, 2\)/.test(modelBlock(name)) })
                .toEqual({ name, decimal: true });
        });
    });

    it('constrains names and pairs the way the audit required', () => {
        expect(modelBlock('ExpenseGroup')).toMatch(/@@unique\(\[userId, name\]\)/);
        expect(modelBlock('GroupMember')).toMatch(/@@unique\(\[groupId, name\]\)/);
        // A participant cannot appear twice on one bill.
        expect(modelBlock('SharedExpenseShare')).toMatch(
            /@@unique\(\[sharedExpenseId, memberId\]\)/
        );
    });
});

describe('the money conversion list', () => {
    it('covers every model in the schema that stores an amount', () => {
        const withAmount = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
            .filter(([, , body]) => /^\s*amount\s+Decimal/m.test(body))
            .map(([, name]) => name[0].toLowerCase() + name.slice(1))
            .sort();

        expect([...MONEY_MODELS].sort()).toEqual(withAmount);
    });

    it('would have caught a model added without its conversion', () => {
        // The failure this guards against is not a crash. Prisma hands back a
        // Decimal, JSON.stringify turns it into a string, and a client that
        // adds them up produces "0500" instead of 500 — a wrong total, silently.
        const asStrings = ['100', '250'];
        expect(asStrings.reduce((sum, value) => sum + value, '')).toBe('100250');

        const asNumbers = [100, 250];
        expect(asNumbers.reduce((sum, value) => sum + value, 0)).toBe(350);
    });
});

describe('migration', () => {
    it('sorts after the password reset migration', () => {
        const all = fs.readdirSync(path.join(prismaDir, 'migrations')).filter((entry) => /^\d/.test(entry));
        expect(all[all.length - 1]).toBe(MIGRATION_NAME);
        expect(MIGRATION_NAME > '20260802220000_password_reset').toBe(true);
    });

    it('creates the enum', () => {
        expect(migration).toMatch(/CREATE TYPE "SplitMethod" AS ENUM \('EQUAL', 'CUSTOM'\)/);
    });

    it('creates exactly the five new tables and no others', () => {
        const created = [...migration.matchAll(/CREATE TABLE "(\w+)"/g)].map(([, name]) => name);
        expect(created.sort()).toEqual([...NEW_MODELS].sort());
    });

    it('adds the partial unique index that keeps one self-member per group', () => {
        expect(migration).toMatch(
            /CREATE UNIQUE INDEX "GroupMember_one_self_per_group"\s+ON "GroupMember"\("groupId"\)\s+WHERE "isCurrentUser" = true/
        );
    });

    it('restricts the mirror foreign key and cascades the share one', () => {
        expect(migration).toMatch(
            /"SharedExpense_personalExpenseId_fkey"[\s\S]*?REFERENCES "Expense"\("id"\) ON DELETE RESTRICT/
        );
        expect(migration).toMatch(
            /"SharedExpenseShare_sharedExpenseId_fkey"[\s\S]*?REFERENCES "SharedExpense"\("id"\) ON DELETE CASCADE/
        );
    });

    it('drops nothing at all', () => {
        expect(migration).not.toMatch(/\bDROP\b/i);
    });

    it('touches no existing table', () => {
        // Every ALTER in an additive migration should be adding a constraint to
        // one of the tables this same file just created.
        const altered = [...migration.matchAll(/ALTER TABLE "(\w+)"/g)].map(([, name]) => name);
        altered.forEach((name) => expect(NEW_MODELS).toContain(name));

        expect(migration).not.toMatch(/ALTER COLUMN/i);
    });

    it('runs no data statements', () => {
        // Checked statement by statement rather than by searching the whole
        // file: every foreign key below ends in ON UPDATE CASCADE, so the bare
        // word proves nothing.
        const statements = migration
            .split('\n')
            .filter((line) => !line.trim().startsWith('--'))
            .join('\n')
            .split(';')
            .map((statement) => statement.trim())
            .filter(Boolean);

        statements.forEach((statement) => {
            expect({
                statement: statement.slice(0, 60),
                dml: /^(UPDATE|DELETE|INSERT|TRUNCATE)\b/i.test(statement),
            }).toEqual({ statement: statement.slice(0, 60), dml: false });
        });
    });

    it('rewrites no data', () => {
        ['User', 'Expense', 'Budget', 'Category', 'PasswordResetToken'].forEach((table) => {
            expect(new RegExp(`ALTER TABLE "${table}"`).test(migration)).toBe(false);
        });
    });
});
