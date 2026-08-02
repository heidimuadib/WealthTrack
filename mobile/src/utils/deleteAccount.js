// Deleting an account asks for one of two proofs, and which one is not a
// choice the user makes — it follows the account. An account created with a
// password proves itself with that password, checked by the server. An account
// created through Google has no password to prove, so it types a word instead.
//
// The difference matters: demanding a password from a Google-only account
// would leave those users unable to delete their own data, and offering a
// typed word to a password account would be a weaker guard than the one
// already available.

// Deliberately forgiving about case and surrounding spaces. The word is there
// to make deletion an act rather than a slip, and a keyboard that autocapitals
// the first letter should not read as a wrong answer.
export const confirmationMatches = (input, phrase) => {
    if (typeof input !== 'string' || typeof phrase !== 'string') {
        return false;
    }

    const wanted = phrase.trim();

    // An empty phrase would otherwise match an empty box and wave the deletion
    // straight through — the one bug in here that would actually cost data.
    if (wanted === '') {
        return false;
    }

    return input.trim().toLocaleUpperCase() === wanted.toLocaleUpperCase();
};

// Drives the enabled state of the destructive button, and is checked again at
// submit. `submitting` is in here rather than only on the button because a
// second tap landing during the request would send a second delete.
export const canSubmitDeletion = ({
    hasPassword,
    password = '',
    confirmation = '',
    phrase = '',
    submitting = false,
} = {}) => {
    if (submitting) {
        return false;
    }

    if (hasPassword) {
        return typeof password === 'string' && password.length > 0;
    }

    return confirmationMatches(confirmation, phrase);
};
