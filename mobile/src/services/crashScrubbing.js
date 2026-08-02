// Everything that leaves the device on a crash passes through here first.
//
// The starting position is that a crash report needs the stack and nothing
// else. What went wrong is in the frames; who it happened to, what they spent,
// and what they called their categories are not diagnostic — they are somebody
// else's business that happens to be in memory at the time. So this strips by
// default and keeps by exception, rather than the other way round.
//
// Kept deliberately free of the Sentry SDK so the rules can be tested as data
// in, data out, with no transport and no mocking.

const REDACTED = '[redacted]';

// Ordered roughly by how badly each one would matter if it escaped.
const PATTERNS = [
    // A JWT is a live credential until it expires.
    /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}(?:\.[A-Za-z0-9_-]+)?/g,
    /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
    // Avatar paths are unguessable-but-public, so one in a report is a working
    // link to someone's face.
    /\/uploads\/avatars\/[A-Za-z0-9._-]+/g,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    // Peso figures, with or without grouping — the amounts themselves.
    /₱\s?\d[\d,]*(?:\.\d{1,2})?/g,
];

export const scrubText = (value) => {
    if (typeof value !== 'string' || value === '') {
        return value;
    }

    return PATTERNS.reduce((text, pattern) => text.replace(pattern, REDACTED), value);
};

// Breadcrumbs are where user data leaks in without anyone deciding to send it:
// console breadcrumbs carry whatever was logged, http breadcrumbs carry request
// bodies and avatar URLs, and a tap breadcrumb carries the accessibility label
// of what was tapped — which on this app is a category name.
//
// So the categories that survive are the two that describe where the user was
// rather than what they had: which screen, and whether the app was
// foregrounded. Everything else is dropped whole.
const KEPT_CATEGORIES = new Set(['navigation', 'app.lifecycle']);

export const scrubBreadcrumb = (crumb) => {
    if (!crumb || !KEPT_CATEGORIES.has(crumb.category)) {
        return null;
    }

    const scrubbed = {
        ...crumb,
        message: scrubText(crumb.message),
    };

    // Route params ride along in navigation data, and this app pushes a whole
    // expense — amount, notes and all — into EditExpense. Only the two screen
    // names are kept, and only when they are plain strings.
    if (crumb.category === 'navigation' && crumb.data) {
        const { from, to } = crumb.data;
        scrubbed.data = {
            ...(typeof from === 'string' ? { from: scrubText(from) } : {}),
            ...(typeof to === 'string' ? { to: scrubText(to) } : {}),
        };
    } else {
        delete scrubbed.data;
    }

    return scrubbed;
};

export const scrubEvent = (event) => {
    if (!event) {
        return event;
    }

    const safe = { ...event };

    // Whole sections that cannot carry anything diagnostic we are entitled to.
    // request holds the URL, headers, cookies and body; user holds the email
    // and IP; extra and contexts.response hold whatever was attached last.
    delete safe.request;
    delete safe.user;
    delete safe.extra;
    delete safe.server_name;

    if (safe.contexts) {
        safe.contexts = { ...safe.contexts };
        delete safe.contexts.response;
        // "Paul's Phone" is a name, and the model and OS below are what
        // actually help reproduce anything.
        if (safe.contexts.device) {
            safe.contexts.device = { ...safe.contexts.device };
            delete safe.contexts.device.name;
        }
    }

    safe.message = scrubText(safe.message);

    if (safe.logentry) {
        safe.logentry = { ...safe.logentry, message: scrubText(safe.logentry.message) };
    }

    // The exception message is written by whoever threw, which includes servers
    // and libraries — the stack frames are ours, the sentence may not be.
    if (safe.exception?.values) {
        safe.exception = {
            ...safe.exception,
            values: safe.exception.values.map((value) => ({
                ...value,
                value: scrubText(value.value),
            })),
        };
    }

    if (Array.isArray(safe.breadcrumbs)) {
        safe.breadcrumbs = safe.breadcrumbs.map(scrubBreadcrumb).filter(Boolean);
    }

    return safe;
};
