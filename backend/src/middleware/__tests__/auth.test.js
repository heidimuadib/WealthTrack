const jwt = require('jsonwebtoken');
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

describe('auth middleware', () => {
    it('rejects a request with no token', () => {
        const res = mockRes();
        const next = jest.fn();

        auth(withHeader(undefined), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects a token that is not ours', () => {
        const res = mockRes();
        const next = jest.fn();
        const forged = jwt.sign({ id: 1 }, 'a different secret');

        auth(withHeader(`Bearer ${forged}`), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects an expired token', () => {
        const res = mockRes();
        const next = jest.fn();
        const stale = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: -10 });

        auth(withHeader(`Bearer ${stale}`), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects a malformed token', () => {
        const res = mockRes();
        const next = jest.fn();

        auth(withHeader('Bearer not.a.token'), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('admits a valid token and carries the account id it names', () => {
        const res = mockRes();
        const next = jest.fn();
        const req = withHeader(`Bearer ${jwt.sign({ id: 7 }, process.env.JWT_SECRET)}`);

        auth(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
        // This is the id every downstream query scopes to, which is why the
        // controllers never need one from the request.
        expect(req.user.id).toBe(7);
    });

    it('never reveals why a token failed', () => {
        // Distinguishing "expired" from "forged" tells an attacker which half
        // of the problem they have solved.
        const expired = mockRes();
        const forged = mockRes();

        auth(withHeader(`Bearer ${jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: -10 })}`), expired, jest.fn());
        auth(withHeader(`Bearer ${jwt.sign({ id: 1 }, 'other secret')}`), forged, jest.fn());

        expect(expired.json.mock.calls).toEqual(forged.json.mock.calls);
    });
});
