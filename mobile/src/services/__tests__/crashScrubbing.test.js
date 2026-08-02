import { scrubText, scrubEvent, scrubBreadcrumb } from '../crashScrubbing';

// A stand-in for the worst case: an event that has picked up everything the
// app touches. Nothing in here should survive the trip.
const SENSITIVE = {
    email: 'juan.delacruz@example.com',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NDJ9.s1gn4tur3_v4lu3',
    avatar: '/uploads/avatars/u42-1785593415318.png',
    amount: '₱12,450.75',
};

describe('scrubText', () => {
    it('redacts an authentication token', () => {
        expect(scrubText(`failed with ${SENSITIVE.token}`)).not.toContain('eyJhbGciOi');
        expect(scrubText(`Authorization: Bearer abc.def-ghi`)).not.toContain('abc.def-ghi');
    });

    it('redacts an email address', () => {
        expect(scrubText(`no user for ${SENSITIVE.email}`)).not.toContain('juan.delacruz');
        expect(scrubText(`no user for ${SENSITIVE.email}`)).not.toContain('example.com');
    });

    it('redacts a profile photo path, which is a working link to a face', () => {
        expect(scrubText(`GET ${SENSITIVE.avatar} 404`)).not.toContain('u42-1785593415318');
    });

    it('redacts peso amounts, grouped or not', () => {
        expect(scrubText('remaining ₱12,450.75')).not.toContain('12,450');
        expect(scrubText('remaining ₱250')).not.toContain('250');
        expect(scrubText('remaining ₱ 1000.50')).not.toContain('1000.50');
    });

    it('leaves ordinary diagnostic text alone', () => {
        // Over-redaction would make reports useless, which is its own failure.
        const message = "Cannot read property 'map' of undefined";
        expect(scrubText(message)).toBe(message);
    });

    it('passes through anything that is not a string', () => {
        expect(scrubText(undefined)).toBeUndefined();
        expect(scrubText(null)).toBeNull();
        expect(scrubText('')).toBe('');
    });
});

describe('scrubEvent — whole sections that never travel', () => {
    const event = () => ({
        message: 'boom',
        request: {
            url: 'https://wealthtrack.duckdns.org/expenses?month=8',
            headers: { Authorization: `Bearer ${SENSITIVE.token}` },
            cookies: 'session=abc',
            data: { amount: 1250, notes: 'lunch with the team' },
        },
        user: { id: 42, email: SENSITIVE.email, ip_address: '203.0.113.4' },
        extra: { lastExpense: { amount: 1250, notes: 'dinner' } },
        server_name: 'Paul-Phone',
        contexts: {
            device: { name: "Paul's Phone", model: 'Infinix X6525', family: 'Infinix' },
            os: { name: 'Android', version: '13' },
            response: { body: { error: 'nope' } },
        },
    });

    it('drops the request entirely — url, headers, cookies and body', () => {
        expect(scrubEvent(event()).request).toBeUndefined();
    });

    it('drops the user, so no email, id or IP address travels', () => {
        expect(scrubEvent(event()).user).toBeUndefined();
    });

    it('drops extra and the response body', () => {
        const safe = scrubEvent(event());
        expect(safe.extra).toBeUndefined();
        expect(safe.contexts.response).toBeUndefined();
    });

    it('drops the device name but keeps the model that helps reproduce it', () => {
        const safe = scrubEvent(event());
        expect(safe.contexts.device.name).toBeUndefined();
        expect(safe.contexts.device.model).toBe('Infinix X6525');
        expect(safe.contexts.os.version).toBe('13');
    });

    it('does not mutate the event it was given', () => {
        const original = event();
        scrubEvent(original);
        expect(original.request).toBeDefined();
        expect(original.user.email).toBe(SENSITIVE.email);
    });
});

describe('scrubEvent — messages written by someone else', () => {
    it('scrubs the exception message', () => {
        const safe = scrubEvent({
            exception: {
                values: [
                    { type: 'Error', value: `No account for ${SENSITIVE.email}` },
                    { type: 'Error', value: `token ${SENSITIVE.token} rejected` },
                ],
            },
        });

        const serialised = JSON.stringify(safe);
        expect(serialised).not.toContain('juan.delacruz');
        expect(serialised).not.toContain('eyJhbGciOi');
    });

    it('scrubs the top-level message and logentry', () => {
        const safe = scrubEvent({
            message: `spent ${SENSITIVE.amount}`,
            logentry: { message: `mailed ${SENSITIVE.email}` },
        });

        expect(safe.message).not.toContain('12,450');
        expect(safe.logentry.message).not.toContain('juan.delacruz');
    });

    it('survives an event with almost nothing in it', () => {
        expect(scrubEvent({})).toEqual({});
        expect(scrubEvent(null)).toBeNull();
    });
});

describe('scrubBreadcrumb', () => {
    it('drops console breadcrumbs, which carry whatever was logged', () => {
        expect(
            scrubBreadcrumb({ category: 'console', message: `user ${SENSITIVE.email}` })
        ).toBeNull();
    });

    it('drops http breadcrumbs, which carry bodies and avatar URLs', () => {
        expect(
            scrubBreadcrumb({ category: 'xhr', data: { url: SENSITIVE.avatar } })
        ).toBeNull();
        expect(scrubBreadcrumb({ category: 'fetch', data: { url: '/expenses' } })).toBeNull();
    });

    it('drops tap breadcrumbs, whose labels are category names in this app', () => {
        expect(
            scrubBreadcrumb({ category: 'ui.click', message: 'Food & Dining' })
        ).toBeNull();
    });

    it('keeps navigation, but only the two screen names', () => {
        const crumb = scrubBreadcrumb({
            category: 'navigation',
            data: {
                from: 'Home',
                to: 'EditExpense',
                // React Navigation carries route params, and this app pushes a
                // whole expense into EditExpense.
                params: { expense: { amount: 1250, notes: 'lunch with the team' } },
            },
        });

        expect(crumb.data).toEqual({ from: 'Home', to: 'EditExpense' });
        expect(JSON.stringify(crumb)).not.toContain('lunch with the team');
        expect(JSON.stringify(crumb)).not.toContain('1250');
    });

    it('keeps app lifecycle without its data', () => {
        const crumb = scrubBreadcrumb({
            category: 'app.lifecycle',
            message: 'foreground',
            data: { anything: SENSITIVE.email },
        });

        expect(crumb.message).toBe('foreground');
        expect(crumb.data).toBeUndefined();
    });

    it('drops anything it does not recognise', () => {
        expect(scrubBreadcrumb({ category: 'sentry.transaction' })).toBeNull();
        expect(scrubBreadcrumb({})).toBeNull();
        expect(scrubBreadcrumb(null)).toBeNull();
    });
});

describe('password reset data', () => {
    const RESET_TOKEN = 'V1StGXR8_Z5jdHi6B-myTabcdefghijklmnopqrstuvwx';
    const RESET_URL = `https://wealthtrack.duckdns.org/reset-password?token=${RESET_TOKEN}&lang=fil`;

    it('redacts the token out of a reset link but leaves the link recognisable', () => {
        const scrubbed = scrubText(`opened ${RESET_URL}`);

        expect(scrubbed).not.toContain(RESET_TOKEN);
        // "a reset link failed" is the diagnostic part, and it survives.
        expect(scrubbed).toContain('/reset-password?token=');
        expect(scrubbed).toContain('[redacted]');
    });

    it('redacts password fields out of a serialised body', () => {
        const body = JSON.stringify({
            token: RESET_TOKEN,
            newPassword: 'a-good-password',
            currentPassword: 'the-old-one',
        });

        const scrubbed = scrubText(body);

        expect(scrubbed).not.toContain(RESET_TOKEN);
        expect(scrubbed).not.toContain('a-good-password');
        expect(scrubbed).not.toContain('the-old-one');
    });

    it('redacts a password passed in a query string', () => {
        expect(scrubText('POST /auth/password?currentPassword=hunter2')).not.toContain('hunter2');
    });

    it('strips a reset link out of an event, wherever it landed', () => {
        const safe = scrubEvent({
            message: `Crash after opening ${RESET_URL}`,
            request: { url: RESET_URL, data: { token: RESET_TOKEN, newPassword: 'secret123' } },
            exception: { values: [{ value: `reset failed for ${RESET_URL}` }] },
            breadcrumbs: [
                { category: 'xhr', data: { url: RESET_URL } },
                { category: 'console', message: `token=${RESET_TOKEN}` },
                { category: 'navigation', data: { from: 'Login', to: 'ForgotPassword' } },
            ],
        });

        const serialised = JSON.stringify(safe);
        expect(serialised).not.toContain(RESET_TOKEN);
        expect(serialised).not.toContain('secret123');
        // The one breadcrumb worth keeping — which screen they were on — stays.
        expect(safe.breadcrumbs).toHaveLength(1);
        expect(safe.breadcrumbs[0].data).toEqual({ from: 'Login', to: 'ForgotPassword' });
    });

    it('keeps an email out of a forgot-password crash', () => {
        const safe = scrubEvent({
            message: 'forgot-password failed',
            request: { data: { email: 'juan.delacruz@example.com' } },
            breadcrumbs: [{ category: 'console', message: 'requesting reset for juan.delacruz@example.com' }],
        });

        expect(JSON.stringify(safe)).not.toContain('juan.delacruz');
    });
});

describe('a realistic event, end to end', () => {
    it('lets nothing sensitive through', () => {
        const safe = scrubEvent({
            message: `Crash while saving ${SENSITIVE.amount}`,
            request: {
                url: `https://wealthtrack.duckdns.org${SENSITIVE.avatar}`,
                headers: { Authorization: `Bearer ${SENSITIVE.token}` },
                data: { amount: 1250, notes: 'lunch with the team' },
            },
            user: { email: SENSITIVE.email },
            exception: { values: [{ value: `rejected for ${SENSITIVE.email}` }] },
            breadcrumbs: [
                { category: 'console', message: `token=${SENSITIVE.token}` },
                { category: 'xhr', data: { url: SENSITIVE.avatar } },
                { category: 'ui.click', message: 'Food & Dining' },
                { category: 'navigation', data: { from: 'Home', to: 'Budget' } },
            ],
        });

        const serialised = JSON.stringify(safe);

        [SENSITIVE.email, SENSITIVE.token, SENSITIVE.avatar, '12,450', 'lunch with the team'].forEach(
            (secret) => expect(serialised).not.toContain(secret)
        );
        expect(serialised).not.toContain('Food & Dining');

        // And the one breadcrumb worth keeping is still there.
        expect(safe.breadcrumbs).toHaveLength(1);
        expect(safe.breadcrumbs[0].data).toEqual({ from: 'Home', to: 'Budget' });
    });
});
