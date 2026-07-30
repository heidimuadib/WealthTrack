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
        const token = useAuthStore.getState().token;
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Signing in is allowed to fail without destroying the session.
const ENTRY_ROUTES = ['/auth/login', '/auth/register'];

// The token lives for an hour and there is no refresh flow, so every screen
// would otherwise start silently failing once it lapses. Clearing the session
// on a 401 sends the user back to the login screen instead.
api.interceptors.response.use(
    (response) => response,
    (error) => {
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
    me: () => api.get('/auth/me'),
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

export const categoryService = {
    getAll: () => api.get('/categories'),
    create: (data) => api.post('/categories', data),
    update: (id, data) => api.put(`/categories/${id}`, data),
    delete: (id) => api.delete(`/categories/${id}`),
};

export default api;
