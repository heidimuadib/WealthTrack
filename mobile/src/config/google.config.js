// The *Web* OAuth client id from the Google Cloud project, not the Android one.
// Google mints the ID token with this as its audience, which is exactly what
// the API checks it against; the Android client is never named here because
// Google matches it by package name and signing certificate instead.
//
// Not a secret — it ships inside every copy of the app. The Web client's
// *secret* is a different value, is not needed to verify an ID token, and must
// never appear in this repo.
export const GOOGLE_WEB_CLIENT_ID =
    '149631908995-5trnmgg0fls3953gnnuhnuntaq5du0hl.apps.googleusercontent.com';
