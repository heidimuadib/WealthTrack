import axios from 'axios';
import useAuthStore from '../store/authStore';
import { API_URL } from '../config/api.config';

const api = axios.create({
    baseURL: API_URL,
    // Without a ceiling, a request to an unreachable host hangs until the OS
    // gives up — minutes of spinner rather than an error the user can act on.
    // This is the exact failure the adb reverse tunnel produces when it drops.
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use(
    (config) => {
        if (__DEV__) {
            // A FormData body prints as an unreadable blob of internal state,
            // and an image's bytes are not worth a screen of log either way.
            const body = config.data instanceof FormData ? '[multipart]' : config.data || '';
            console.log(`[MOBILE REQ] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`, body);
        }
        const token = useAuthStore.getState().token;
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        if (__DEV__) {
            console.error('[MOBILE REQ ERR]', error);
        }
        return Promise.reject(error);
    }
);

// Signing in is allowed to fail without destroying the session.
const ENTRY_ROUTES = ['/auth/login', '/auth/register'];

api.interceptors.response.use(
    (response) => {
        if (__DEV__) {
            console.log(`[MOBILE RES OK] ${response.config.url} Status: ${response.status}`, response.data);
        }
        return response;
    },
    (error) => {
        if (__DEV__) {
            console.error(`[MOBILE RES FAIL] ${error.config?.url || ''} Message: ${error.message}`, error.response?.data || error.code || '');
        }
        const url = error.config?.url || '';
        const isEntryRoute = ENTRY_ROUTES.some((route) => url.includes(route));

        if (error.response?.status === 401 && !isEntryRoute) {
            useAuthStore.getState().logout();
        }

        return Promise.reject(error);
    }
);

export const authService = {
    login: (email, password) => api.post('/auth/login', { email, password }),
    register: (name, email, password) => api.post('/auth/register', { name, email, password }),
    // Trades a Google ID token for one of ours. Same response shape as login,
    // so callers cannot tell the two routes apart.
    google: (idToken) => api.post('/auth/google', { idToken }),
    me: () => api.get('/auth/me'),
    updateProfile: (data) => api.put('/auth/profile', data),
    // The boundary has to be chosen by the HTTP layer, so the Content-Type set
    // on the instance is dropped here rather than overridden.
    uploadAvatar: (form) =>
        api.post('/auth/avatar', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
            // A photo over a phone's uplink needs more room than the 15s a
            // JSON call gets.
            timeout: 60000,
        }),
    removeAvatar: () => api.delete('/auth/avatar'),
    // The language travels with the request because the reset link is opened
    // in a browser, well away from the app that knows which one to use.
    forgotPassword: (email, lang) => api.post('/auth/forgot-password', { email, lang }),
    // currentPassword is omitted for an account that has none — the server
    // decides which of the two this is, from the account rather than the body.
    changePassword: (currentPassword, newPassword) =>
        api.put('/auth/password', {
            ...(currentPassword ? { currentPassword } : {}),
            newPassword,
        }),
    // No id travels with this: the server deletes whichever account the token
    // names. The password is sent only for accounts that have one — a Google
    // account has none to prove, and the server knows which is which without
    // being told.
    deleteAccount: (password) =>
        api.delete('/auth/account', { data: password ? { password } : {} }),
};

export const expenseService = {
    // Pass { month, year } to scope to a single month; omit for full history.
    getAll: (params) => api.get('/expenses', { params }),
    create: (data) => api.post('/expenses', data),
    update: (id, data) => api.put(`/expenses/${id}`, data),
    delete: (id) => api.delete(`/expenses/${id}`),
};

export const budgetService = {
    get: (month, year) => api.get(`/budget?month=${month}&year=${year}`),
    set: (data) => api.post('/budget', data),
};

export const reportService = {
    summary: (year) => api.get(`/reports/summary?year=${year}`),
};

export const categoryService = {
    getAll: () => api.get('/categories'),
    create: (data) => api.post('/categories', data),
    update: (id, data) => api.put(`/categories/${id}`, data),
    delete: (id) => api.delete(`/categories/${id}`),
};

export default api;
