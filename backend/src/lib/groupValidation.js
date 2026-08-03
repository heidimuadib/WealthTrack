// Input rules for groups and members, kept together so the two controllers
// cannot drift into disagreeing about what a name is.
//
// Everything here returns a value or an error object — nothing writes a
// response — so the rules can be tested as data in, data out.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Long enough for "Bohol Laag with the office people", short enough to render
// in a list row without eating the balance beside it.
const MAX_GROUP_NAME = 80;
const MAX_DESCRIPTION = 300;
const MAX_MEMBER_NAME = 80;
const MAX_CONTACT_NOTE = 200;

// Format only, deliberately not a palette. The app's own swatches are the eight
// category colours, but a group is not a category and picking outside that set
// is a reasonable thing to want. What is refused is a value that could not be
// a colour at all, which is what would reach a style prop and render nothing.
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// Fields the server owns. A request that mentions one is refused rather than
// quietly stripped: silently ignoring an attempt to set isCurrentUser leaves
// the caller believing it worked, and the difference between those two
// outcomes is the whole of the self-member invariant.
const PROTECTED_FIELDS = [
    'id',
    'userId',
    'groupId',
    'isCurrentUser',
    'archivedAt',
    'createdAt',
    'updatedAt',
    'members',
];

const invalid = (code, message) => ({ error: { code, message } });

const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

// A malformed id is a client mistake rather than a missing row, and saying so
// gives away nothing: it is a statement about the string, not about whether
// anything exists behind it. Matches how the integer routes answer a
// non-numeric id.
const validateUuidParam = (value, label) =>
    isUuid(value) ? null : invalid('INVALID_ID', `Invalid ${label} id`);

const rejectProtectedFields = (body) => {
    const offending = PROTECTED_FIELDS.filter((field) =>
        Object.prototype.hasOwnProperty.call(body || {}, field)
    );

    if (offending.length === 0) {
        return null;
    }

    // Named without echoing the value, so a rejected request cannot bounce
    // anything the caller sent back through a log.
    return invalid('READ_ONLY_FIELD', `${offending[0]} cannot be set on this request`);
};

// Trims, then measures. A name of nothing but spaces is a blank name, and
// finding that out after it has been stored is too late.
const requiredText = (value, { label, max }) => {
    if (typeof value !== 'string' || value.trim() === '') {
        return invalid('NAME_REQUIRED', `${label} is required`);
    }

    const trimmed = value.trim();

    if (trimmed.length > max) {
        return invalid('NAME_TOO_LONG', `${label} must be ${max} characters or fewer`);
    }

    return { value: trimmed };
};

// Optional free text. An explicit null clears it; undefined leaves it alone,
// which is what makes a partial update partial.
const optionalText = (value, { label, max }) => {
    if (value === null) {
        return { value: null };
    }

    if (typeof value !== 'string') {
        return invalid('INVALID_TEXT', `${label} must be text`);
    }

    const trimmed = value.trim();

    if (trimmed.length > max) {
        return invalid('TEXT_TOO_LONG', `${label} must be ${max} characters or fewer`);
    }

    // An empty string and an absent value mean the same thing to a reader, so
    // they are stored the same way rather than as two kinds of nothing.
    return { value: trimmed === '' ? null : trimmed };
};

const optionalColor = (value) => {
    if (value === null) {
        return { value: null };
    }

    if (typeof value !== 'string' || !HEX_COLOR.test(value.trim())) {
        return invalid('INVALID_COLOR', 'Colour must be a hex value like #0E5A54');
    }

    return { value: value.trim() };
};

// The name the account holder appears under inside their own group. Taken from
// the profile, clamped rather than refused: a Google display name arrives
// unbounded, and a group creation that fails because somebody's Google account
// has a long name would be a strange thing to have to explain.
//
// The fallback is deliberately not the email address. The app never shows an
// email as a display name — the settings screen falls back to a generic label —
// and a group member list is somewhere a name might be read aloud or shown to
// the people it names. The self-member can be renamed afterwards.
const SELF_MEMBER_FALLBACK = 'You';

const selfMemberName = (profileName) => {
    if (typeof profileName !== 'string' || profileName.trim() === '') {
        return SELF_MEMBER_FALLBACK;
    }

    return profileName.trim().slice(0, MAX_MEMBER_NAME);
};

module.exports = {
    MAX_GROUP_NAME,
    MAX_DESCRIPTION,
    MAX_MEMBER_NAME,
    MAX_CONTACT_NOTE,
    PROTECTED_FIELDS,
    SELF_MEMBER_FALLBACK,
    isUuid,
    validateUuidParam,
    rejectProtectedFields,
    requiredText,
    optionalText,
    optionalColor,
    selfMemberName,
};
