import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '../config/google.config';
import { translate } from '../i18n';

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

// Takes a translation key rather than a sentence, and resolves it here at the
// moment of failure, so the wording follows the language the user is actually
// reading rather than whichever one was loaded when this module first ran.
const fail = (key) => {
    const message = translate(key);
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
            throw fail('google.noToken');
        }

        return idToken;
    } catch (error) {
        if (error?.code === statusCodes.SIGN_IN_CANCELLED) {
            const cancelled = new Error(translate('google.cancelled'));
            cancelled.code = GOOGLE_CANCELLED;
            throw cancelled;
        }

        // Google reports every configuration mistake as one opaque code, so the
        // code itself is the only thing worth reading when this fails.
        if (__DEV__) {
            console.warn('[GoogleSignIn] failed', error?.code, error?.message);
        }

        if (error?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            throw fail('google.playServices');
        }

        if (error?.code === statusCodes.IN_PROGRESS) {
            throw fail('google.inProgress');
        }

        // DEVELOPER_ERROR (code 10) means Google refused the app itself, not
        // the account: the OAuth client does not list this build's package name
        // and signing fingerprint, or the wrong client id is configured. It is
        // never something the user can retry their way out of.
        if (error?.code === statusCodes.DEVELOPER_ERROR || String(error?.code) === '10') {
            throw fail('google.notRegistered');
        }

        if (error?.userMessage) {
            throw error;
        }

        throw fail('google.failed');
    }
};
