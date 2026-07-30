import { QueryClient } from '@tanstack/react-query';
import { isHandledGlobally, isOffline } from '../utils/error';

// Retrying a 4xx just repeats a request the server already refused — a wrong
// password or an invalid month is not going to change on the second attempt.
// A 401 is worse than useless: the interceptor has already cleared the session,
// so a retry would fire an unauthenticated request on the way to the login
// screen. Connection failures are the case worth retrying.
const shouldRetry = (failureCount, error) => {
    if (isHandledGlobally(error)) {
        return false;
    }

    const status = error?.response?.status;
    if (status >= 400 && status < 500) {
        return false;
    }

    return failureCount < (isOffline(error) ? 2 : 1);
};

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Switching tabs used to refetch every time and flash a spinner
            // over data that was seconds old. Inside this window the cached
            // result is served immediately instead.
            staleTime: 30_000,
            // Kept well beyond staleTime so returning to a screen has
            // something to render while the refetch runs.
            gcTime: 5 * 60_000,
            retry: shouldRetry,
            // React Native has no window to focus; screen focus is handled
            // explicitly by useRefreshOnFocus.
            refetchOnWindowFocus: false,
        },
        mutations: {
            retry: false,
        },
    },
});
