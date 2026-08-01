// Screens used to swallow failures with console.warn and then render their
// empty state, so a dropped connection looked exactly like a month with no
// spending. These turn a failure into something worth showing the user.

import { translate } from '../i18n';

// A 401 is already handled globally by the response interceptor, which clears
// the session and sends the user back to the login screen. Showing an error for
// it too would flash a message on a screen that is about to disappear.
export const isHandledGlobally = (error) => error?.response?.status === 401;

export const isOffline = (error) =>
    !error?.response && (error?.request !== undefined || error?.code === 'ECONNABORTED');

// Short enough to sit in a banner, specific enough to act on.
export const errorMessage = (error) => {
    if (isOffline(error)) {
        return translate('errors.offline');
    }

    const status = error?.response?.status;

    if (status === 429) {
        return translate('errors.rateLimited');
    }

    if (status >= 500) {
        return translate('errors.server');
    }

    // 4xx responses carry a message written for exactly this situation. The
    // API writes them in English; mapping known ones per language is a later
    // pass.
    const fromServer = error?.response?.data?.error;
    if (typeof fromServer === 'string' && fromServer.trim()) {
        return fromServer;
    }

    return translate('errors.generic');
};

// Paired with the message so a screen can headline the cause without parsing
// the message string.
export const errorTitle = (error) =>
    isOffline(error) ? translate('errors.noConnection') : translate('errors.couldntLoad');
