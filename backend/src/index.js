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

// Helmet's Strict-Transport-Security (HSTS) header can cause Android's OkHttp
// to silently upgrade HTTP connections to HTTPS, dropping responses.
// Disabled for local dev — re-enable for production with HTTPS.
app.use(helmet({
    hsts: false,
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
if (process.env.NODE_ENV !== 'production') {
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
