const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

// A JWT cannot be recalled once signed, so a password reset on its own would
// change the lock and leave every key already cut still working. Each token
// therefore states which password it was minted against, and this checks that
// answer against the account before letting the request through.
//
// That costs one indexed primary-key lookup per authenticated request. It buys
// two things: a reset actually ends the sessions it was meant to end, and a
// deleted account's token stops working at the door rather than three lines
// into whichever controller happens to look the user up.
const auth = async (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    let decoded;

    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (ex) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    try {
        const account = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, passwordChangedAt: true },
        });

        if (!account) {
            return res.status(401).json({ error: 'Account no longer exists' });
        }

        const current = account.passwordChangedAt
            ? new Date(account.passwordChangedAt).getTime()
            : null;
        // Tokens signed before this field existed carry no stamp, and every
        // account that has never changed a password has none either — so they
        // agree, and deploying this does not sign the whole userbase out.
        const carried = decoded.pwdAt ?? null;

        if (carried !== current) {
            // Same sentence as a forged or expired token: which of the three
            // it was is not the caller's business.
            return res.status(401).json({ error: 'Invalid or expired token.' });
        }

        req.user = { id: account.id };
        next();
    } catch (error) {
        // A database that cannot answer must not be read as a valid session.
        console.error('[auth] session check failed', error?.code || 'unknown');
        res.status(500).json({ error: 'Something went wrong' });
    }
};

module.exports = auth;
