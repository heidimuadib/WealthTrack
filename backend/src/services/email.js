// Transactional email through Resend's HTTP API.
//
// Resend over SMTP because SMTP would mean storing a mailbox password and
// holding a connection open; this is one authenticated POST over TLS with an
// API key that can be rotated or revoked on its own. Node 18+ has fetch built
// in, so the whole integration adds no dependency at all — which matters on a
// project that has already been bitten twice by a transitive native package.
//
// Inert without credentials. Every function below returns cleanly when
// RESEND_API_KEY is unset, so a fresh clone, a test run and a server that has
// not been configured yet all behave identically: nothing is sent, nothing
// throws, and the caller cannot tell the difference — which is exactly what
// the no-enumeration rule needs anyway.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const config = () => ({
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
    // Where the reset link points. Separate from the API host so the link in
    // an email is never accidentally built from a LAN address.
    appUrl: process.env.PUBLIC_APP_URL,
});

const isEmailConfigured = () => {
    const { apiKey, from } = config();
    return Boolean(apiKey && from);
};

// Plain text alongside HTML: some clients show one, some the other, and a
// reset link that only exists in an HTML part is a reset link some people
// cannot use.
const resetEmailBody = (resetUrl, minutes) => ({
    subject: 'Reset your WealthTrack password',
    text: [
        'Someone asked to reset the password for your WealthTrack account.',
        '',
        'Open this link to choose a new one:',
        resetUrl,
        '',
        `The link works once and expires in ${minutes} minutes.`,
        '',
        'If this was not you, nothing has changed and you can ignore this email.',
    ].join('\n'),
    html: [
        '<p>Someone asked to reset the password for your WealthTrack account.</p>',
        `<p><a href="${resetUrl}">Choose a new password</a></p>`,
        `<p>The link works once and expires in ${minutes} minutes.</p>`,
        '<p>If this was not you, nothing has changed and you can ignore this email.</p>',
    ].join(''),
});

// Returns whether the message left the building. The caller must not turn that
// into a different HTTP response — a failed send and a successful one look the
// same to the requester on purpose.
const sendPasswordResetEmail = async ({ to, resetUrl, minutes }) => {
    const { apiKey, from } = config();

    if (!apiKey || !from) {
        return { sent: false, reason: 'not_configured' };
    }

    const { subject, text, html } = resetEmailBody(resetUrl, minutes);

    try {
        const response = await fetch(RESEND_ENDPOINT, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ from, to: [to], subject, text, html }),
        });

        if (!response.ok) {
            // Status only. The body can quote the recipient address back, and
            // an address in a log is the thing this whole endpoint is built to
            // avoid writing down.
            console.error('[email] password reset send failed', response.status);
            return { sent: false, reason: 'provider_error' };
        }

        return { sent: true };
    } catch (error) {
        // Likewise: the name of the failure, never the request that caused it.
        console.error('[email] password reset send threw', error?.name || 'unknown');
        return { sent: false, reason: 'provider_error' };
    }
};

module.exports = { isEmailConfigured, sendPasswordResetEmail, resetEmailBody };
