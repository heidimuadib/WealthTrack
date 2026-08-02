const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth.routes');
const expenseRoutes = require('./routes/expense.routes');
const budgetRoutes = require('./routes/budget.routes');
const categoryRoutes = require('./routes/category.routes');
const reportRoutes = require('./routes/report.routes');

dotenv.config();

// Every token this process issues is signed with JWT_SECRET. Starting without
// one means jwt.sign throws on the first register, so fail loudly at boot
// rather than at the first request.
if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Development is anything that has not said otherwise, so a forgotten
// NODE_ENV can only ever leave production hardening off — never switch
// development into a mode the LAN phone cannot reach.
const isProduction = process.env.NODE_ENV === 'production';

// Nginx terminates TLS on the same host and forwards over loopback, so every
// request arrives from 127.0.0.1. Trusting loopback is what restores the real
// client address in req.ip: without it the rate limiters below bucket every
// user in the world together, and one noisy client locks out everyone else.
// Deliberately not `true`, which would let any caller spoof X-Forwarded-For
// and sidestep the limiter entirely.
app.set('trust proxy', 'loopback');

// HSTS is the one header that has to differ by environment. In development the
// phone reaches this process over plain HTTP on the LAN, and Android's OkHttp
// honours the header by silently upgrading to HTTPS — nothing is listening
// there, so responses simply vanish. In production Nginx serves TLS only and
// already redirects HTTP, so the header costs nothing and closes the gap the
// redirect leaves open on a first visit.
//
// Six months, no preload: wealthtrack.duckdns.org sits under a shared public
// suffix, and preloading commits a name far more permanently than a
// certificate renewal cycle deserves.
app.use(helmet({
    hsts: isProduction ? { maxAge: 15552000, includeSubDomains: true, preload: false } : false,
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
}));
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Length', 'Content-Type'],
}));
// Profile photos are served straight from disk, ahead of the logger and the
// rate limiter: they are static bytes rather than API calls, so rendering an
// avatar should not spend the caller's request budget or a screen of log. The
// URLs are unguessable rather than secret — the same trade as serving avatars
// from a CDN.
app.use(
    '/uploads',
    express.static(path.join(__dirname, '..', 'uploads'), {
        maxAge: '7d',
        index: false,
        dotfiles: 'ignore',
    })
);

// The privacy policy has to be readable by someone with no account, no app and
// no patience — a store reviewer with a browser. Served from disk ahead of the
// logger and the rate limiter for the same reasons avatars are: it is static
// bytes, not an API call, and reading it should not spend anyone's budget.
// Nginx already terminates TLS in front of this, so the public URL is
// https://<host>/privacy with no extra server configuration to maintain.
app.use(
    '/privacy',
    express.static(path.join(__dirname, '..', 'public', 'privacy'), {
        maxAge: '1d',
        index: 'index.html',
        dotfiles: 'ignore',
    })
);

app.use(express.json({ limit: '100kb' }));

// Anything here would otherwise be written to the terminal, and scrolled past
// by whoever is looking over your shoulder, in plain text.
const SECRET_FIELDS = ['password', 'currentPassword', 'newPassword', 'token', 'idToken'];

const redactSecrets = (body) => {
    const safe = { ...body };
    SECRET_FIELDS.forEach((field) => {
        if (field in safe) {
            safe[field] = '[redacted]';
        }
    });
    return safe;
};

// Request logging is a development aid. In production it is noise at best and
// a slow leak of who is using the API and when at worst.
if (!isProduction) {
    app.use((req, res, next) => {
        const start = Date.now();
        console.log(`\n========================================`);
        console.log(`[BACKEND REQ] ${new Date().toISOString()} ${req.method} ${req.url}`);
        if (Object.keys(req.body || {}).length > 0) {
            console.log(`[BACKEND BODY]`, JSON.stringify(redactSecrets(req.body)));
        }
        res.on('finish', () => {
            console.log(
                `[BACKEND RES] ${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - start}ms)`
            );
            console.log(`========================================\n`);
        });
        next();
    });
}

// Credential endpoints are the ones worth guessing at, so they get a tight
// budget of their own. Counting only failures lets someone who keeps logging
// in successfully carry on uninterrupted.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Try again in a few minutes.' },
});

// A far looser ceiling for everything else — high enough that normal use never
// reaches it, low enough to blunt a runaway client.
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Slow down and try again shortly.' },
});

app.use('/auth/login', authLimiter);
app.use('/auth/register', authLimiter);
app.use('/auth/google', authLimiter);
// Deletion is irreversible and, for a password account, guessable: it checks a
// password the same way login does, so it gets login's budget rather than the
// general one. skipSuccessfulRequests means the one call that works never
// counts against anybody.
app.use('/auth/account', authLimiter);
app.use(apiLimiter);

// Routes
app.use('/auth', authRoutes);
app.use('/expenses', expenseRoutes);
app.use('/budget', budgetRoutes);
app.use('/categories', categoryRoutes);
app.use('/reports', reportRoutes);

app.get('/', (req, res) => {
    res.send('WealthTrack API is running');
});

// Lets a deploy target check the process is alive without authenticating.
app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// Malformed JSON is rejected by express.json() before any route runs, and
// without this it surfaces as an HTML error page the app cannot parse.
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({ error: 'Invalid JSON body' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
