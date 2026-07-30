import { authService } from './api';
import useAuthStore from '../store/authStore';

// Runs once on app start. A stored token is treated as a claim to be checked,
// not as proof of a live session — the old code trusted it blindly, which left
// the app "logged in" with an expired token and no user data.
export const restoreSession = async () => {
    const { loadStored, hydrate, logout, setRestoring } = useAuthStore.getState();

    try {
        const stored = await loadStored();

        if (!stored) {
            return;
        }

        // Hydrate first so the request interceptor can attach the token to the
        // validation call that follows.
        hydrate(stored);

        try {
            const res = await authService.me();
            // Server confirmed the token and returned fresh profile data.
            hydrate({ token: stored.token, user: res.data.user });
        } catch (error) {
            if (error.response?.status === 401) {
                // Token is expired or the account is gone. The response
                // interceptor clears it too; doing it here keeps the intent
                // explicit and independent of interceptor ordering.
                await logout();
            }
            // Any other failure is most likely no network. Keep the cached
            // session rather than logging someone out for being offline — a
            // real 401 will clear it on the next request that gets through.
        }
    } finally {
        setRestoring(false);
    }
};
