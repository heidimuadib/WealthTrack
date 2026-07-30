import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

// Screens in a bottom tab navigator stay mounted, so returning to one fires no
// mount and no refetch. This supplies the missing signal.
//
// It refetches only when the cached data has gone stale, which is what keeps a
// tab switch from spending a request on data fetched seconds ago. The callback
// deliberately has no dependencies — reading the current values through a ref
// means it runs on focus transitions only, rather than re-running every time
// the query re-renders while the screen is already in view.
export const useRefreshOnFocus = ({ refetch, isStale }) => {
    const latest = useRef({ refetch, isStale });
    latest.current = { refetch, isStale };

    useFocusEffect(
        useCallback(() => {
            if (latest.current.isStale) {
                latest.current.refetch();
            }
        }, [])
    );
};

export default useRefreshOnFocus;
