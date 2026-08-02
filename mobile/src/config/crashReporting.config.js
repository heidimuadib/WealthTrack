// Crash reporting is off until a DSN is put here.
//
// A Sentry DSN is not a secret — it is a write-only ingest address and ships
// inside every copy of the app — but it is also not something to invent, so it
// stays empty and reporting stays off rather than pointing at a project that
// does not exist. Fill this in from Settings → Client Keys in the Sentry
// project, and reporting turns on for release builds only.
//
// Leaving it blank is a working state, not a broken one: initCrashReporting()
// returns false, the SDK is never started, and the error boundary still shows
// its recovery screen.
export const SENTRY_DSN = '';

// Reported with every event so a crash can be tied to the build it came from.
// These have to match android/app/build.gradle — a test reads the gradle file
// and fails if they drift, because a report attributed to the wrong build is
// worse than one with no version at all.
export const APP_VERSION = '1.0';
export const APP_BUILD = '1';
