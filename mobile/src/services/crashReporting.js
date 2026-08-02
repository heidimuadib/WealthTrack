import * as Sentry from '@sentry/react-native';

import { SENTRY_DSN, APP_VERSION, APP_BUILD } from '../config/crashReporting.config';
import { scrubEvent, scrubBreadcrumb, scrubText } from './crashScrubbing';

// Reports only what nobody can see any other way: a crash on somebody else's
// phone, in a build that has already shipped. Everything the app handles on
// purpose — a rejected password, a category that is still in use, no
// connection — already has a translated message and a retry, and sending those
// as crashes would bury the real ones under thousands of working failures.
//
// Nothing here is a usage metric. Sessions, performance tracing and screenshots
// are all off; the questions this can answer are "what broke" and "in which
// build", and deliberately not "who was using it".

let active = false;

export const isCrashReportingActive = () => active;

export const initCrashReporting = () => {
    // A development crash is already on screen in red, with a working stack and
    // the source right there — sending it somewhere would add nothing and would
    // fill the quota with errors nobody shipped.
    if (__DEV__ || !SENTRY_DSN) {
        active = false;
        return false;
    }

    Sentry.init({
        dsn: SENTRY_DSN,
        environment: 'production',
        // Ties an event to the exact build. Without it a stack trace is a
        // stack trace from some version of the app, which is nearly useless
        // once there is more than one out there.
        release: `com.wealthtrack@${APP_VERSION}+${APP_BUILD}`,
        dist: APP_BUILD,

        // Native Android crashes as well as JavaScript ones. A JS-only
        // reporter misses exactly the failures that are hardest to reproduce.
        enableNative: true,
        enableNativeCrashHandling: true,
        attachStacktrace: true,

        // No identity, ever. Without this the SDK attaches the device IP and
        // whatever user it can infer.
        sendDefaultPii: false,

        // A screenshot of this app is a screenshot of somebody's finances, and
        // the view hierarchy carries accessibility labels — which on the add
        // screen are category names.
        attachScreenshot: false,
        attachViewHierarchy: false,

        // Performance tracing and session tracking are product analytics
        // wearing a crash reporter's coat: sessions measure how often the app
        // is opened, traces measure how long screens take. Neither answers
        // "what crashed".
        tracesSampleRate: 0,
        enableAutoPerformanceTracing: false,
        enableAutoSessionTracking: false,
        // Failed HTTP requests are handled by the app and shown to the user
        // with a translated message; they are not crashes.
        enableCaptureFailedRequests: false,

        // Short enough that a report cannot become a log of a whole session.
        maxBreadcrumbs: 30,

        beforeSend: scrubEvent,
        beforeBreadcrumb: scrubBreadcrumb,
    });

    active = true;
    return true;
};

// Called by the error boundary when a render throws. componentStack is a list
// of component names — code, not data — which is what turns "somewhere in a
// render" into a specific screen.
export const reportFatal = (error, componentStack) => {
    if (!active) {
        return false;
    }

    try {
        Sentry.withScope((scope) => {
            scope.setLevel('fatal');
            // Separates a caught render crash from a native or unhandled one.
            scope.setTag('handler', 'error_boundary');

            if (componentStack) {
                scope.setContext('react', { componentStack: scrubText(componentStack) });
            }

            Sentry.captureException(error);
        });
        return true;
    } catch (reportingError) {
        // A reporter that throws must never be the reason the recovery screen
        // fails to appear.
        return false;
    }
};
