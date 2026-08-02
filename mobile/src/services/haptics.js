import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

// Four taps, and a deliberately small vocabulary. Haptics stop meaning
// anything the moment everything buzzes: if saving an expense and switching
// tabs feel the same, the feedback has become texture rather than information.
// So this exists to be used sparingly, at moments the user caused and would
// want confirmed.
//
// Nothing about the action travels with it. These take no arguments on
// purpose — there is no amount, category, account or route to attach, and no
// breadcrumb is recorded, so a vibration can never become a record of what
// somebody just spent.

// react-native-haptic-feedback rather than RN's own Vibration, because
// Vibration only knows durations. On Android these map to the platform's own
// haptic constants, which are the short crisp ticks the system uses; a 10ms
// call to Vibration is a motor pulse, and a pattern of them is a pager. The
// difference is the whole point of the feature.
const OPTIONS = {
    // A device with haptics switched off in system settings should stay
    // silent rather than fall back to a buzz the user has already declined.
    enableVibrateFallback: false,
    ignoreAndroidSystemSettings: false,
};

// Every call is wrapped. A missing native module, an emulator without a
// vibrator, a manufacturer ROM that throws — none of that is a reason for a
// saved expense to become a crash, and the visual confirmation has already
// happened either way.
const fire = (type) => {
    try {
        ReactNativeHapticFeedback.trigger(type, OPTIONS);
        return true;
    } catch (error) {
        return false;
    }
};

export const haptics = {
    // The lightest thing available: a selection landed, a card was dismissed,
    // a preference flipped. Meant to be barely noticed.
    light: () => fire('impactLight'),

    // Something the user asked for finished, and finished well. Fired after
    // the server has confirmed it, never on an optimistic update — celebrating
    // a save that has not happened yet is how an app teaches people not to
    // trust it.
    success: () => fire('notificationSuccess'),

    // Something irreversible just happened, or something needs attention.
    // Deliberately not success: a deletion completing is not a small triumph,
    // and buzzing happily as somebody's data disappears reads as gloating.
    warning: () => fire('notificationWarning'),

    // A thing the user explicitly submitted did not work. Not for passive
    // failures — a background refetch that fails is not worth a vibration,
    // because nobody was waiting on it.
    error: () => fire('notificationError'),
};

export default haptics;
