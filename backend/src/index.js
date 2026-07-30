const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth.routes');
const expenseRoutes = require('./routes/expense.routes');
const budgetRoutes = require('./routes/budget.routes');
const categoryRoutes = require('./routes/category.routes');

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

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '100kb' }));

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
app.use(apiLimiter);

// Routes
app.use('/auth', authRoutes);
app.use('/expenses', expenseRoutes);
app.use('/budget', budgetRoutes);
app.use('/categories', categoryRoutes);

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
