import { authService } from './api';
import useAuthStore from '../store/authStore';

// Session tracing earned its keep during the login-hang investigation, but it
// narrates account activity, so it stays out of release builds.
const trace = (...args) => {
    if (__DEV__) {
        console.log('[Session]', ...args);
    }
};

// Runs once on app start. A stored token is treated as a claim to be checked,
// not as proof of a live session — the old code trusted it blindly, which left
// the app "logged in" with an expired token and no user data.
export const restoreSession = async () => {
    trace('restoreSession started');
    const { loadStored, hydrate, logout, setRestoring } = useAuthStore.getState();

    try {
        const stored = await loadStored();
        trace('stored token found:', !!stored);

        if (!stored) {
            return;
        }

        // Hydrate first so the request interceptor can attach the token to the
        // validation call that follows.
        hydrate(stored);

        try {
            trace('Validating stored token with /auth/me ...');
            const res = await authService.me();
            trace('Token valid, user:', res.data.user?.email);
            // Server confirmed the token and returned fresh profile data.
            hydrate({ token: stored.token, user: res.data.user });
        } catch (error) {
            trace('/auth/me failed:', error.response?.status, error.message);
            if (error.response?.status === 401) {
                // Only logout if the user hasn't manually logged in during this
                // async window — prevents the race where a slow /auth/me 401
                // clears a freshly-minted session.
                const currentlyAuthenticated = useAuthStore.getState().isAuthenticated;
                const currentToken = useAuthStore.getState().token;
                if (!currentlyAuthenticated || currentToken === stored.token) {
                    trace('Token expired, logging out.');
                    await logout();
                } else {
                    trace('User already logged in manually, skipping logout.');
                }
            }
            // Any other failure is most likely no network. Keep the cached
            // session rather than logging someone out for being offline.
        }
    } finally {
        // Only set restoring=false if the user hasn't already done so via login()
        trace('restoreSession done, setting isRestoring=false');
        setRestoring(false);
    }
};
