import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '../config/google.config';

// Backing out of the account chooser is a decision, not a failure, so callers
// check for this instead of showing the user an error they caused on purpose.
export const GOOGLE_CANCELLED = 'GOOGLE_CANCELLED';

let configured = false;

const ensureConfigured = () => {
    if (!configured) {
        GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
        configured = true;
    }
};

const fail = (message) => {
    const error = new Error(message);
    // errorMessage() in utils/error only understands API failures; this carries
    // wording for the ones that never reach the API.
    error.userMessage = message;
    return error;
};

// Returns a Google ID token for the account the user picked. Nothing in it is
// trusted here — the API verifies it against Google's public keys.
export const signInWithGoogle = async () => {
    ensureConfigured();

    try {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

        // Without this the last account is signed straight back in, and someone
        // with two Google accounts can never reach the second one.
        await GoogleSignin.signOut();

        const account = await GoogleSignin.signIn();
        const idToken = account?.idToken || (await GoogleSignin.getTokens()).idToken;

        if (!idToken) {
            throw fail('Google did not return a sign-in token. Please try again.');
        }

        return idToken;
    } catch (error) {
        if (error?.code === statusCodes.SIGN_IN_CANCELLED) {
            const cancelled = new Error('Sign-in cancelled');
            cancelled.code = GOOGLE_CANCELLED;
            throw cancelled;
        }

        // Google reports every configuration mistake as one opaque code, so the
        // code itself is the only thing worth reading when this fails.
        if (__DEV__) {
            console.warn('[GoogleSignIn] failed', error?.code, error?.message);
        }

        if (error?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            throw fail('Google Play services is unavailable on this device.');
        }

        if (error?.code === statusCodes.IN_PROGRESS) {
            throw fail('A sign-in is already in progress.');
        }

        // DEVELOPER_ERROR (code 10) means Google refused the app itself, not
        // the account: the OAuth client does not list this build's package name
        // and signing fingerprint, or the wrong client id is configured. It is
        // never something the user can retry their way out of.
        if (error?.code === statusCodes.DEVELOPER_ERROR || String(error?.code) === '10') {
            throw fail(
                'This build is not registered with Google. Its signing fingerprint has to be added to the Android OAuth client.'
            );
        }

        if (error?.userMessage) {
            throw error;
        }

        throw fail('Google sign-in failed. Please try again.');
    }
};
