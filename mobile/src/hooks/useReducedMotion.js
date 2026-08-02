import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Someone who has asked the OS for less animation has asked every app on the
// device, and meant it. Extracted from the skeleton loader once a second thing
// needed it — one answer to this question, in one place, rather than two
// implementations that could disagree about what the setting means.
//
// The optional calls keep it working under a test renderer, where the native
// accessibility module is not there at all.
export const useReducedMotion = () => {
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        let alive = true;

        // Wrapped rather than chained: the method is missing on some platforms
        // and returns a non-promise on others, and a preference lookup must
        // never be able to throw during a mount.
        Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
            .then((value) => {
                if (alive) {
                    setReduced(!!value);
                }
            })
            .catch(() => {
                // Unreadable means no preference to honour.
            });

        const subscription = AccessibilityInfo.addEventListener?.(
            'reduceMotionChanged',
            (value) => setReduced(!!value)
        );

        return () => {
            alive = false;
            subscription?.remove?.();
        };
    }, []);

    return reduced;
};

export default useReducedMotion;
