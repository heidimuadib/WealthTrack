// Prisma and the mail provider are both stubbed. These assert the decisions
// the endpoints make — what is written, what is refused, and what is said back
// — which is where every security property of a reset flow lives.
jest.mock('../../lib/prisma', () => ({
    user: { findUnique: jest.fn(), update: jest.fn() },
    passwordResetToken: {
        findUnique: jest.fn(),
        create: jest.fn((args) => ({ op: 'token.create', args })),
        updateMany: jest.fn((args) => ({ op: 'token.updateMany', args })),
    },
    // Array form for forgot-password, callback form for the two that need to
    // decide something mid-transaction.
    $transaction: jest.fn(async (arg) =>
        typeof arg === 'function'
            ? arg({
                  user: { update: jest.fn(async (a) => ({ id: 42, ...a.data })) },
                  passwordResetToken: { updateMany: jest.fn(async () => ({ count: 1 })) },
              })
            : arg
    ),
}));

jest.mock('../../services/email', () => ({
    sendPasswordResetEmail: jest.fn(async () => ({ sent: true })),
    isEmailConfigured: jest.fn(() => true),
}));

const bcrypt = require('bcryptjs');
const prisma = require('../../lib/prisma');
const { sendPasswordResetEmail } = require('../../services/email');
const { hashResetToken, createResetToken } = require('../../lib/passwordReset');
const { forgotPassword, resetPassword, changePassword } = require('../auth.controller');

const OWNER = 42;
const OTHER = 99;
const PASSWORD = 'correct horse battery';
const HASH = bcrypt.hashSync(PASSWORD, 4);

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

const GENERIC = {
    message: 'If an account exists for that email, reset instructions have been sent.',
};

let errorSpy;
let logSpy;

beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env.PUBLIC_APP_URL = 'https://wealthtrack.duckdns.org';
    process.env.JWT_SECRET = 'test-secret-not-a-real-one';
    delete process.env.PASSWORD_RESET_DEBUG;
});

afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
});

// ---------------------------------------------------------------- forgot ----

describe('forgot-password — telling everyone the same thing', () => {
    const cases = [
        ['a password account', { id: OWNER, password: HASH }],
        ['an address with no account', null],
        ['a Google-only account', { id: OWNER, password: null }],
    ];

    it.each(cases)('answers identically for %s', async (_label, user) => {
        prisma.user.findUnique.mockResolvedValue(user);
        const res = mockRes();

        await forgotPassword({ body: { email: 'juan@example.com' } }, res);

        expect(res.json).toHaveBeenCalledWith(GENERIC);
        expect(res.status).not.toHaveBeenCalled();
    });

    it('answers the same when the database fails', async () => {
        // A 500 here would mean "that address exists, but something broke".
        prisma.user.findUnique.mockRejectedValue(new Error('connection refused'));
        const res = mockRes();

        await forgotPassword({ body: { email: 'juan@example.com' } }, res);

        expect(res.json).toHaveBeenCalledWith(GENERIC);
        expect(res.status).not.toHaveBeenCalled();
    });

    it('answers the same for junk input, without touching the database', async () => {
        for (const email of ['', '   ', undefined, null, 42, 'a'.repeat(300) + '@x.com']) {
            const res = mockRes();
            await forgotPassword({ body: { email } }, res);
            expect(res.json).toHaveBeenCalledWith(GENERIC);
        }

        expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('sends nothing to a Google-only account', async () => {
        prisma.user.findUnique.mockResolvedValue({ id: OWNER, password: null });

        await forgotPassword({ body: { email: 'juan@example.com' } }, mockRes());

        expect(sendPasswordResetEmail).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});

describe('forgot-password — the token it issues', () => {
    beforeEach(() => prisma.user.findUnique.mockResolvedValue({ id: OWNER, password: HASH }));

    it('normalises the address exactly as login does', async () => {
        await forgotPassword({ body: { email: '  Juan@Example.COM ' } }, mockRes());

        expect(prisma.user.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { email: 'juan@example.com' } })
        );
    });

    it('stores a hash and never the token itself', async () => {
        await forgotPassword({ body: { email: 'juan@example.com' } }, mockRes());

        const created = prisma.passwordResetToken.create.mock.calls[0][0];
        const emailed = sendPasswordResetEmail.mock.calls[0][0].resetUrl;
        const raw = decodeURIComponent(new URL(emailed).searchParams.get('token'));

        expect(created.data.tokenHash).toBe(hashResetToken(raw));
        expect(created.data.tokenHash).not.toBe(raw);
        // The raw value must appear nowhere in what was written.
        expect(JSON.stringify(created)).not.toContain(raw);
    });

    it('retires any earlier unused link for that account', async () => {
        await forgotPassword({ body: { email: 'juan@example.com' } }, mockRes());

        const ops = prisma.$transaction.mock.calls[0][0];
        expect(ops[0].op).toBe('token.updateMany');
        expect(ops[0].args.where).toEqual({ userId: OWNER, consumedAt: null });
        expect(ops[1].op).toBe('token.create');
        // Retire before issue, so the new link is never the one retired.
        expect(ops).toHaveLength(2);
    });

    it('gives the link a future expiry scoped to the right account', async () => {
        await forgotPassword({ body: { email: 'juan@example.com' } }, mockRes());

        const { data } = prisma.passwordResetToken.create.mock.calls[0][0];
        expect(data.userId).toBe(OWNER);
        expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
        // Half an hour, not half a day.
        expect(data.expiresAt.getTime()).toBeLessThan(Date.now() + 31 * 60 * 1000);
    });

    it('never returns the token in the response', async () => {
        const res = mockRes();

        await forgotPassword({ body: { email: 'juan@example.com' } }, res);

        expect(res.json).toHaveBeenCalledWith(GENERIC);
        expect(JSON.stringify(res.json.mock.calls)).not.toContain('token');
    });

    it('carries the reader’s language, and only a known one', async () => {
        await forgotPassword({ body: { email: 'juan@example.com', lang: 'ceb' } }, mockRes());
        expect(sendPasswordResetEmail.mock.calls[0][0].resetUrl).toContain('lang=ceb');

        jest.clearAllMocks();
        prisma.user.findUnique.mockResolvedValue({ id: OWNER, password: HASH });

        // Anything unrecognised falls back rather than being echoed into a URL.
        await forgotPassword(
            { body: { email: 'juan@example.com', lang: '"><script>' } },
            mockRes()
        );
        expect(sendPasswordResetEmail.mock.calls[0][0].resetUrl).toContain('lang=en');
    });

    it('still answers normally when the provider fails', async () => {
        sendPasswordResetEmail.mockRejectedValue(new Error('provider down'));
        const res = mockRes();

        await forgotPassword({ body: { email: 'juan@example.com' } }, res);

        expect(res.json).toHaveBeenCalledWith(GENERIC);
    });

    it('logs neither the address nor the link', async () => {
        await forgotPassword({ body: { email: 'juan@example.com' } }, mockRes());

        const logged = JSON.stringify([...errorSpy.mock.calls, ...logSpy.mock.calls]);
        expect(logged).not.toContain('juan@example.com');
        expect(logged).not.toContain('reset-password?token');
    });

    it('prints the link only when explicitly asked, and never in production', async () => {
        process.env.PASSWORD_RESET_DEBUG = 'true';
        process.env.NODE_ENV = 'production';
        await forgotPassword({ body: { email: 'juan@example.com' } }, mockRes());
        expect(JSON.stringify(logSpy.mock.calls)).not.toContain('reset-password');

        process.env.NODE_ENV = 'development';
        await forgotPassword({ body: { email: 'juan@example.com' } }, mockRes());
        expect(JSON.stringify(logSpy.mock.calls)).toContain('reset-password');

        delete process.env.NODE_ENV;
    });
});

// ----------------------------------------------------------------- reset ----

describe('reset-password — refusing a link', () => {
    const valid = createResetToken();

    const live = () => ({
        id: 1,
        userId: OWNER,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
    });

    it.each([
        ['malformed', 'not-a-token'],
        ['empty', ''],
        ['missing', undefined],
        ['far too long', 'a'.repeat(500)],
    ])('refuses a %s token without querying', async (_label, token) => {
        const res = mockRes();

        await resetPassword({ body: { token, newPassword: 'a-good-password' } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
    });

    it('refuses a token that was never issued', async () => {
        prisma.passwordResetToken.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await resetPassword({ body: { token: valid.token, newPassword: 'a-good-password' } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('refuses an expired token', async () => {
        prisma.passwordResetToken.findUnique.mockResolvedValue({
            ...live(),
            expiresAt: new Date(Date.now() - 1000),
        });
        const res = mockRes();

        await resetPassword({ body: { token: valid.token, newPassword: 'a-good-password' } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a token that has already been spent', async () => {
        prisma.passwordResetToken.findUnique.mockResolvedValue({
            ...live(),
            consumedAt: new Date(),
        });
        const res = mockRes();

        await resetPassword({ body: { token: valid.token, newPassword: 'a-good-password' } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a replay that races the first use', async () => {
        // The read says unspent, the guarded update says otherwise: another
        // request claimed it in between. The database decides, not the read.
        prisma.passwordResetToken.findUnique.mockResolvedValue(live());
        prisma.$transaction.mockImplementation(async (fn) =>
            fn({
                user: { update: jest.fn() },
                passwordResetToken: { updateMany: jest.fn(async () => ({ count: 0 })) },
            })
        );
        const res = mockRes();

        await resetPassword({ body: { token: valid.token, newPassword: 'a-good-password' } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('says the same thing however the link failed', async () => {
        const answers = [];

        for (const record of [null, { ...live(), consumedAt: new Date() }, { ...live(), expiresAt: new Date(0) }]) {
            prisma.passwordResetToken.findUnique.mockResolvedValue(record);
            const res = mockRes();
            await resetPassword({ body: { token: valid.token, newPassword: 'a-good-password' } }, res);
            answers.push(JSON.stringify(res.json.mock.calls));
        }

        expect(new Set(answers).size).toBe(1);
    });

    it('refuses a weak password before spending the token', async () => {
        prisma.passwordResetToken.findUnique.mockResolvedValue(live());
        const res = mockRes();

        await resetPassword({ body: { token: valid.token, newPassword: 'short' } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});

describe('reset-password — a link that works', () => {
    const valid = createResetToken();

    let tx;

    beforeEach(() => {
        prisma.passwordResetToken.findUnique.mockResolvedValue({
            id: 1,
            userId: OWNER,
            expiresAt: new Date(Date.now() + 60_000),
            consumedAt: null,
        });

        tx = {
            user: { update: jest.fn(async () => ({ id: OWNER })) },
            passwordResetToken: { updateMany: jest.fn(async () => ({ count: 1 })) },
        };
        prisma.$transaction.mockImplementation(async (fn) => fn(tx));
    });

    it('looks the link up by hash, never by the token', async () => {
        await resetPassword({ body: { token: valid.token, newPassword: 'a-good-password' } }, mockRes());

        expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { tokenHash: hashResetToken(valid.token) } })
        );
    });

    it('stores the new password hashed, never in the clear', async () => {
        await resetPassword({ body: { token: valid.token, newPassword: 'a-good-password' } }, mockRes());

        const { data } = tx.user.update.mock.calls[0][0];
        expect(data.password).not.toBe('a-good-password');
        expect(bcrypt.compareSync('a-good-password', data.password)).toBe(true);
    });

    it('stamps the change, which is what ends every open session', async () => {
        await resetPassword({ body: { token: valid.token, newPassword: 'a-good-password' } }, mockRes());

        const { data, where } = tx.user.update.mock.calls[0][0];
        expect(where).toEqual({ id: OWNER });
        expect(data.passwordChangedAt).toBeInstanceOf(Date);
    });

    it('spends the link under a guard, and retires the account’s others', async () => {
        await resetPassword({ body: { token: valid.token, newPassword: 'a-good-password' } }, mockRes());

        const [claim, sweep] = tx.passwordResetToken.updateMany.mock.calls.map((c) => c[0]);
        expect(claim.where).toEqual({ id: 1, consumedAt: null });
        expect(sweep.where).toEqual({ userId: OWNER, consumedAt: null });
    });

    it('answers success without signing anyone in', async () => {
        const res = mockRes();

        await resetPassword({ body: { token: valid.token, newPassword: 'a-good-password' } }, res);

        expect(res.json).toHaveBeenCalledWith({ reset: true });
        // Proving control of a mailbox is a weaker sign-in than the password
        // they now have, so no token is issued here.
        expect(JSON.stringify(res.json.mock.calls)).not.toContain('token');
    });

    it('leaks nothing when the database fails, and logs no token', async () => {
        prisma.$transaction.mockRejectedValue(new Error('relation "User" does not exist'));
        const res = mockRes();

        await resetPassword({ body: { token: valid.token, newPassword: 'a-good-password' } }, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Something went wrong' });
        const everything = JSON.stringify([...res.json.mock.calls, ...errorSpy.mock.calls]);
        expect(everything).not.toContain('relation "User"');
        expect(everything).not.toContain(valid.token);
    });
});

// ---------------------------------------------------------------- change ----

describe('change-password — an account with a password', () => {
    const req = (body) => ({ user: { id: OWNER }, body });

    let tx;

    beforeEach(() => {
        prisma.user.findUnique.mockResolvedValue({
            id: OWNER,
            email: 'juan@example.com',
            name: 'Juan',
            avatarUrl: null,
            password: HASH,
            passwordChangedAt: null,
        });

        tx = {
            user: {
                update: jest.fn(async (args) => ({
                    id: OWNER,
                    email: 'juan@example.com',
                    name: 'Juan',
                    avatarUrl: null,
                    ...args.data,
                })),
            },
            passwordResetToken: { updateMany: jest.fn(async () => ({ count: 0 })) },
        };
        prisma.$transaction.mockImplementation(async (fn) => fn(tx));
    });

    it('demands the current password', async () => {
        const res = mockRes();

        await changePassword(req({ newPassword: 'a-good-password' }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses the wrong current password', async () => {
        const res = mockRes();

        await changePassword(req({ currentPassword: 'nope', newPassword: 'a-good-password' }), res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a new password identical to the old one', async () => {
        const res = mockRes();

        await changePassword(req({ currentPassword: PASSWORD, newPassword: PASSWORD }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a weak new password', async () => {
        const res = mockRes();

        await changePassword(req({ currentPassword: PASSWORD, newPassword: 'short' }), res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('changes it when the current password is right', async () => {
        const res = mockRes();

        await changePassword(req({ currentPassword: PASSWORD, newPassword: 'a-good-password' }), res);

        const { data } = tx.user.update.mock.calls[0][0];
        expect(bcrypt.compareSync('a-good-password', data.password)).toBe(true);
        expect(data.passwordChangedAt).toBeInstanceOf(Date);
    });

    it('hands back a fresh token so the person who did it stays signed in', async () => {
        const res = mockRes();

        await changePassword(req({ currentPassword: PASSWORD, newPassword: 'a-good-password' }), res);

        const answer = res.json.mock.calls[0][0];
        expect(typeof answer.token).toBe('string');
        expect(answer.user.hasPassword).toBe(true);
        // Never the hash.
        expect(answer.user.password).toBeUndefined();
        expect(JSON.stringify(answer)).not.toContain(HASH);
    });

    it('retires any reset link sitting unread in the mailbox', async () => {
        await changePassword(req({ currentPassword: PASSWORD, newPassword: 'a-good-password' }), mockRes());

        expect(tx.passwordResetToken.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { userId: OWNER, consumedAt: null } })
        );
    });

    it('touches only the authenticated account, whatever the body claims', async () => {
        await changePassword(
            { user: { id: OWNER }, body: { id: OTHER, userId: OTHER, currentPassword: PASSWORD, newPassword: 'a-good-password' } },
            mockRes()
        );

        expect(tx.user.update.mock.calls[0][0].where).toEqual({ id: OWNER });
        expect(prisma.user.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: OWNER } })
        );
    });

    it('never logs the password', async () => {
        prisma.$transaction.mockRejectedValue(new Error('boom'));

        await changePassword(req({ currentPassword: PASSWORD, newPassword: 'a-good-password' }), mockRes());

        const logged = JSON.stringify(errorSpy.mock.calls);
        expect(logged).not.toContain(PASSWORD);
        expect(logged).not.toContain('a-good-password');
    });
});

describe('change-password — a Google-only account', () => {
    beforeEach(() => {
        prisma.user.findUnique.mockResolvedValue({
            id: OWNER,
            email: 'juan@example.com',
            name: 'Juan',
            avatarUrl: null,
            password: null,
            passwordChangedAt: null,
        });
        prisma.$transaction.mockImplementation(async (fn) =>
            fn({
                user: {
                    update: jest.fn(async (args) => ({ id: OWNER, email: 'juan@example.com', ...args.data })),
                },
                passwordResetToken: { updateMany: jest.fn(async () => ({ count: 0 })) },
            })
        );
    });

    it('sets a first password without demanding one it cannot check', async () => {
        // Requiring a current password here would leave these accounts unable
        // to ever have one.
        const res = mockRes();

        await changePassword({ user: { id: OWNER }, body: { newPassword: 'a-good-password' } }, res);

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json.mock.calls[0][0].user.hasPassword).toBe(true);
    });

    it('still enforces the strength rule', async () => {
        const res = mockRes();

        await changePassword({ user: { id: OWNER }, body: { newPassword: 'short' } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('refuses when the account has gone', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await changePassword({ user: { id: OWNER }, body: { newPassword: 'a-good-password' } }, res);

        expect(res.status).toHaveBeenCalledWith(401);
    });
});
