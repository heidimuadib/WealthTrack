import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { queryClient } from '../lib/queryClient';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

// Pure session state + persistence. It deliberately does not import the API
// client — api.js already imports this store, and reaching back the other way
// would create an import cycle. Network validation lives in services/session.js.
const useAuthStore = create((set) => ({
    user: null,
    token: null,
    isAuthenticated: false,
    // Starts true so the navigator can hold on a splash instead of flashing
    // the login screen while the stored session is being checked.
    isRestoring: true,

    login: async (user, token) => {
        // State first so callers can navigate immediately; storage is best effort.
        set({ user, token, isAuthenticated: true, isRestoring: false });
        try {
            await AsyncStorage.multiSet([
                [TOKEN_KEY, token],
                [USER_KEY, JSON.stringify(user)],
            ]);
        } catch (error) {
            if (__DEV__) {
                console.warn('Failed to persist session', error);
            }
        }
    },

    logout: async () => {
        set({ user: null, token: null, isAuthenticated: false, isRestoring: false });
        // Cached expenses and budgets belong to the account that just left.
        // Without this the next person to sign in on this device would be
        // shown the previous one's figures until each query refetched.
        queryClient.clear();
        try {
            await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
        } catch (error) {
            if (__DEV__) {
                console.warn('Failed to clear session', error);
            }
        }
    },

    // Marks the session as active from already-trusted data.
    hydrate: ({ user, token }) => set({ user, token, isAuthenticated: true }),

    setRestoring: (isRestoring) => set({ isRestoring }),

    loadStored: async () => {
        try {
            const entries = await AsyncStorage.multiGet([TOKEN_KEY, USER_KEY]);
            const stored = {};
            entries.forEach(([key, value]) => {
                stored[key] = value;
            });

            const token = stored[TOKEN_KEY];
            if (!token) {
                return null;
            }

            let user = null;
            try {
                user = stored[USER_KEY] ? JSON.parse(stored[USER_KEY]) : null;
            } catch (error) {
                // Corrupt cache is not fatal — /auth/me will supply the user.
                user = null;
            }

            return { token, user };
        } catch (error) {
            if (__DEV__) {
                console.warn('Failed to read stored session', error);
            }
            return null;
        }
    },
}));

export default useAuthStore;
