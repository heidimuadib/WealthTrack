// Screens used to swallow failures with console.warn and then render their
// empty state, so a dropped connection looked exactly like a month with no
// spending. These turn a failure into something worth showing the user.

// A 401 is already handled globally by the response interceptor, which clears
// the session and sends the user back to the login screen. Showing an error for
// it too would flash a message on a screen that is about to disappear.
export const isHandledGlobally = (error) => error?.response?.status === 401;

export const isOffline = (error) =>
    !error?.response && (error?.request !== undefined || error?.code === 'ECONNABORTED');

// Short enough to sit in a banner, specific enough to act on.
export const errorMessage = (error) => {
    if (isOffline(error)) {
        return 'Can’t reach the server. Check your connection and try again.';
    }

    const status = error?.response?.status;

    if (status === 429) {
        return 'Too many requests. Wait a moment and try again.';
    }

    if (status >= 500) {
        return 'The server had a problem. Please try again shortly.';
    }

    // 4xx responses carry a message written for exactly this situation.
    const fromServer = error?.response?.data?.error;
    if (typeof fromServer === 'string' && fromServer.trim()) {
        return fromServer;
    }

    return 'Something went wrong. Please try again.';
};

// Paired with the message so a screen can headline the cause without parsing
// the message string.
export const errorTitle = (error) =>
    isOffline(error) ? 'No connection' : 'Couldn’t load';
