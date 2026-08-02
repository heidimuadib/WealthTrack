jest.mock('../../lib/prisma', () => ({
    user: { findUnique: jest.fn() },
}));

const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');
const auth = require('../auth');

// The middleware reads the secret at call time, so setting it here is enough.
process.env.JWT_SECRET = 'test-secret-not-a-real-one';

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

const withHeader = (value) => ({
    header: (name) => (name === 'Authorization' ? value : undefined),
});

const bearer = (payload) => withHeader(`Bearer ${jwt.sign(payload, process.env.JWT_SECRET)}`);

let errorSpy;

beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    // The common case: an account that has never changed its password.
    prisma.user.findUnique.mockResolvedValue({ id: 7, passwordChangedAt: null });
});

afterEach(() => errorSpy.mockRestore());

describe('rejecting a token outright', () => {
    it('rejects a request with no token', async () => {
        const res = mockRes();
        const next = jest.fn();

        await auth(withHeader(undefined), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
        // Not even a lookup: nothing was claimed.
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a token signed with a different secret', async () => {
        const res = mockRes();
        const next = jest.fn();
        const forged = jwt.sign({ id: 1 }, 'a different secret');

        await auth(withHeader(`Bearer ${forged}`), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
        const res = mockRes();
        const next = jest.fn();
        const stale = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: -10 });

        await auth(withHeader(`Bearer ${stale}`), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects a malformed token', async () => {
        const res = mockRes();
        const next = jest.fn();

        await auth(withHeader('Bearer not.a.token'), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('never reveals which of those it was', async () => {
        // Telling an attacker their token is merely expired confirms it was
        // once real.
        const expired = mockRes();
        const forged = mockRes();

        await auth(
            withHeader(`Bearer ${jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: -10 })}`),
            expired,
            jest.fn()
        );
        await auth(withHeader(`Bearer ${jwt.sign({ id: 1 }, 'other secret')}`), forged, jest.fn());

        expect(expired.json.mock.calls).toEqual(forged.json.mock.calls);
    });
});

describe('checking the session against the account', () => {
    it('admits a valid token and carries the account id it names', async () => {
        const res = mockRes();
        const next = jest.fn();
        const req = bearer({ id: 7, pwdAt: null });

        await auth(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
        // The id every downstream query scopes to, taken from the account the
        // database confirmed rather than from the request.
        expect(req.user).toEqual({ id: 7 });
    });

    it('refuses a token for an account that no longer exists', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        const res = mockRes();
        const next = jest.fn();

        await auth(bearer({ id: 7, pwdAt: null }), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('refuses a token minted before the password changed', async () => {
        // The whole point: this is the session a reset is supposed to end.
        prisma.user.findUnique.mockResolvedValue({
            id: 7,
            passwordChangedAt: new Date('2026-08-02T10:00:00Z'),
        });
        const res = mockRes();
        const next = jest.fn();

        await auth(bearer({ id: 7, pwdAt: null }), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('refuses a token carrying a stale stamp', async () => {
        prisma.user.findUnique.mockResolvedValue({
            id: 7,
            passwordChangedAt: new Date('2026-08-02T12:00:00Z'),
        });
        const res = mockRes();

        await auth(bearer({ id: 7, pwdAt: Date.parse('2026-08-02T10:00:00Z') }), res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('admits the token issued by the change itself', async () => {
        const changedAt = new Date('2026-08-02T12:00:00Z');
        prisma.user.findUnique.mockResolvedValue({ id: 7, passwordChangedAt: changedAt });
        const res = mockRes();
        const next = jest.fn();

        await auth(bearer({ id: 7, pwdAt: changedAt.getTime() }), res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('keeps tokens issued before this field existed working', async () => {
        // Deploying session invalidation must not sign out everyone who was
        // already signed in. An old token has no stamp; an account that has
        // never changed its password has none either, so they agree.
        const res = mockRes();
        const next = jest.fn();

        await auth(bearer({ id: 7 }), res, next);

        expect(next).toHaveBeenCalled();
    });

    it('treats a database that cannot answer as not a valid session', async () => {
        prisma.user.findUnique.mockRejectedValue(new Error('connection refused'));
        const res = mockRes();
        const next = jest.fn();

        await auth(bearer({ id: 7, pwdAt: null }), res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(next).not.toHaveBeenCalled();
        expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('connection refused');
    });
});
