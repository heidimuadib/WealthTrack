// Prisma and the filesystem are both stubbed: these assert the shape of what
// deletion asks the database to do, which is where the security properties
// live. Every clause is checked for the authenticated user's id, so a
// regression that widened one — or took an id from the request — fails here
// rather than in production against somebody else's expenses.
//
// What this cannot prove is that PostgreSQL honours those clauses; that needs
// an integration database, and there is none configured. See the report.
jest.mock('../../lib/prisma', () => ({
    user: { findUnique: jest.fn(), delete: jest.fn((args) => ({ op: 'user.delete', args })) },
    expense: { deleteMany: jest.fn((args) => ({ op: 'expense.deleteMany', args })) },
    budget: { deleteMany: jest.fn((args) => ({ op: 'budget.deleteMany', args })) },
    category: { deleteMany: jest.fn((args) => ({ op: 'category.deleteMany', args })) },
    $transaction: jest.fn(async (ops) => ops),
}));

jest.mock('../../middleware/upload', () => ({
    avatarPublicUrl: jest.fn(),
    deleteAvatarFile: jest.fn(),
}));

const bcrypt = require('bcryptjs');
const prisma = require('../../lib/prisma');
const { deleteAvatarFile } = require('../../middleware/upload');
const { deleteAccount, toPublicUser } = require('../auth.controller');

const OWNER = 42;
const OTHER = 99;

// Cheap rounds: this is proving the comparison is wired up, not bcrypt itself.
const PASSWORD = 'correct horse battery';
const HASH = bcrypt.hashSync(PASSWORD, 4);

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

// The token is the only thing that names the account. Anything else in the
// request is attacker-controlled and must not be read.
const req = (overrides = {}) => ({
    user: { id: OWNER },
    body: {},
    params: {},
    query: {},
    ...overrides,
});

const account = (over = {}) => ({ password: null, avatarUrl: null, ...over });

let errorSpy;

beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    errorSpy.mockRestore();
});

describe('DELETE /auth/account — what gets deleted', () => {
    it('removes expenses, budgets, categories and the user, in foreign-key order', async () => {
        prisma.user.findUnique.mockResolvedValue(account());
        const res = mockRes();

        await deleteAccount(req(), res);

        const ops = prisma.$transaction.mock.calls[0][0].map((op) => op.op);
        expect(ops).toEqual([
            'expense.deleteMany',
            'budget.deleteMany',
            'category.deleteMany',
            'user.delete',
        ]);
        // Expenses before categories is not cosmetic: an expense row holds a
        // foreign key into category, so the other order is rejected outright.
        expect(ops.indexOf('expense.deleteMany')).toBeLessThan(ops.indexOf('category.deleteMany'));
        expect(res.json).toHaveBeenCalledWith({ deleted: true });
    });

    it('does the whole thing in one transaction', async () => {
        prisma.user.findUnique.mockResolvedValue(account());

        await deleteAccount(req(), mockRes());

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        // Half a deletion — expenses gone, account alive — is the one outcome
        // there is no way back from.
        expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(4);
    });
});

describe('DELETE /auth/account — ownership', () => {
    it('scopes every clause to the authenticated account', async () => {
        prisma.user.findUnique.mockResolvedValue(account());

        await deleteAccount(req(), mockRes());

        const ops = prisma.$transaction.mock.calls[0][0];
        expect(ops[0].args).toEqual({ where: { userId: OWNER } });
        expect(ops[1].args).toEqual({ where: { userId: OWNER } });
        expect(ops[2].args).toEqual({ where: { userId: OWNER } });
        expect(ops[3].args).toEqual({ where: { id: OWNER } });
    });

    it('ignores any id the caller supplies', async () => {
        prisma.user.findUnique.mockResolvedValue(account());

        // Every place a client could try to name a different account.
        await deleteAccount(
            req({
                body: { id: OTHER, userId: OTHER },
                params: { id: OTHER },
                query: { userId: OTHER },
            }),
            mockRes()
        );

        const serialised = JSON.stringify(prisma.$transaction.mock.calls[0][0]);
        expect(serialised).toContain(String(OWNER));
        expect(serialised).not.toContain(String(OTHER));
        expect(prisma.user.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: OWNER } })
        );
    });
});

describe('DELETE /auth/account — re-authentication', () => {
    it('requires the password when the account has one', async () => {
        prisma.user.findUnique.mockResolvedValue(account({ password: HASH }));
        const res = mockRes();

        await deleteAccount(req(), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a wrong password without deleting anything', async () => {
        prisma.user.findUnique.mockResolvedValue(account({ password: HASH }));
        const res = mockRes();

        await deleteAccount(req({ body: { password: 'not it' } }), res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('accepts the right password', async () => {
        prisma.user.findUnique.mockResolvedValue(account({ password: HASH }));
        const res = mockRes();

        await deleteAccount(req({ body: { password: PASSWORD } }), res);

        expect(prisma.$transaction).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ deleted: true });
    });

    it('does not demand a password from a Google-only account', async () => {
        // These accounts have no password to prove. Requiring one would leave
        // them unable to delete their own data at all.
        prisma.user.findUnique.mockResolvedValue(account({ password: null }));
        const res = mockRes();

        await deleteAccount(req(), res);

        expect(prisma.$transaction).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ deleted: true });
    });
});

describe('DELETE /auth/account — the avatar file', () => {
    it('removes the photo, and only after the rows are committed', async () => {
        const order = [];
        prisma.user.findUnique.mockResolvedValue(
            account({ avatarUrl: '/uploads/avatars/u42-1700000000000.png' })
        );
        prisma.$transaction.mockImplementation(async () => order.push('transaction'));
        deleteAvatarFile.mockImplementation(() => order.push('unlink'));

        await deleteAccount(req(), mockRes());

        expect(deleteAvatarFile).toHaveBeenCalledWith('/uploads/avatars/u42-1700000000000.png');
        // Unlinking first and then rolling back would leave a live account
        // whose photo had silently vanished.
        expect(order).toEqual(['transaction', 'unlink']);
    });

    it('reads the path before the row that holds it is deleted', async () => {
        prisma.user.findUnique.mockResolvedValue(account({ avatarUrl: '/uploads/avatars/x.png' }));

        await deleteAccount(req(), mockRes());

        expect(prisma.user.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ select: expect.objectContaining({ avatarUrl: true }) })
        );
    });

    it('still succeeds for an account with no photo', async () => {
        prisma.user.findUnique.mockResolvedValue(account({ avatarUrl: null }));
        const res = mockRes();

        await deleteAccount(req(), res);

        expect(res.json).toHaveBeenCalledWith({ deleted: true });
    });
});

describe('DELETE /auth/account — repeated and racing calls', () => {
    it('answers success when the account is already gone', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await deleteAccount(req(), res);

        expect(res.json).toHaveBeenCalledWith({ deleted: true });
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('answers success when a parallel call wins the race', async () => {
        prisma.user.findUnique.mockResolvedValue(account());
        const gone = new Error('Record to delete does not exist.');
        gone.code = 'P2025';
        prisma.$transaction.mockRejectedValue(gone);
        const res = mockRes();

        await deleteAccount(req(), res);

        expect(res.json).toHaveBeenCalledWith({ deleted: true });
    });
});

describe('DELETE /auth/account — failures', () => {
    it('answers 500 without leaking the database error', async () => {
        prisma.user.findUnique.mockResolvedValue(account());
        prisma.$transaction.mockRejectedValue(
            new Error('connect ECONNREFUSED 10.0.0.5:5432 database "wealthtrack" user "admin"')
        );
        const res = mockRes();

        await deleteAccount(req(), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Something went wrong' });
        expect(JSON.stringify(res.json.mock.calls)).not.toMatch(/ECONNREFUSED|5432|admin/);
    });

    it('logs no password, token or connection detail', async () => {
        prisma.user.findUnique.mockResolvedValue(account({ password: HASH }));
        prisma.$transaction.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
        const res = mockRes();

        await deleteAccount(req({ body: { password: PASSWORD } }), res);

        const logged = JSON.stringify(errorSpy.mock.calls);
        expect(logged).not.toContain(PASSWORD);
        expect(logged).not.toContain(HASH);
        expect(logged).not.toContain('ECONNREFUSED');
    });
});

describe('toPublicUser', () => {
    it('reduces the password hash to a boolean and never returns it', async () => {
        const shaped = toPublicUser({
            id: 1,
            email: 'a@b.test',
            name: 'A',
            avatarUrl: null,
            password: HASH,
        });

        expect(shaped.hasPassword).toBe(true);
        expect(shaped).not.toHaveProperty('password');
        expect(JSON.stringify(shaped)).not.toContain(HASH);
    });

    it('reports a Google-only account as having no password', () => {
        expect(toPublicUser({ id: 1, email: 'a@b.test', password: null }).hasPassword).toBe(false);
        expect(toPublicUser({ id: 1, email: 'a@b.test' }).hasPassword).toBe(false);
        expect(toPublicUser({ id: 1, email: 'a@b.test', password: '' }).hasPassword).toBe(false);
    });
});
