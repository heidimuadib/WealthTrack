// Every fetching screen has to tell five situations apart, and the difference
// between them is what the user is told about their own money:
//
//   loading  — nothing cached yet, so there is nothing honest to show
//   error    — nothing cached and the fetch failed; an empty list here would
//              read as "you spent nothing", which is a claim, not a gap
//   empty    — the fetch succeeded and there genuinely is nothing
//   content  — show what we have
//   refreshing — content, with the existing figures left alone
//
// The last one is the reason this is a function rather than a chain of
// ternaries written out per screen: a refetch over cached data must not
// collapse the screen back to a skeleton. React Query already draws that line
// for us — isPending means "no data has ever arrived", isFetching means "a
// request is in flight, cached or not" — so the rule below reads isPending and
// never isFetching. Getting that backwards is what makes an app flash its
// skeleton on every tab switch.

export const LOADING = 'loading';
export const ERROR = 'error';
export const EMPTY = 'empty';
export const CONTENT = 'content';
export const MISSING = 'missing';

export const resolveViewState = ({ isPending, hasData, error, isEmpty = false }) => {
    // Order matters. Loading first: a screen with no data and a request in
    // flight has nothing to say yet, whatever else is true.
    if (isPending && !hasData) {
        return LOADING;
    }

    // Only when there is nothing to fall back on. With cached figures on
    // screen, a failed refresh belongs in a banner over them, not in a
    // full-screen error that throws away data the user could still read.
    if (error && !hasData) {
        return ERROR;
    }

    // hasData is required, not incidental: it is what makes this "the server
    // said there is nothing" rather than "we have not heard back yet".
    if (isEmpty && hasData) {
        return EMPTY;
    }

    return CONTENT;
};

// A sixth situation, for the screens that show one row picked out of a list
// they already hold rather than fetching that row on its own: the list is here,
// and the row this screen was opened for is not in it.
//
// Whether that is an absence depends entirely on whether the list has settled.
// Every write refetches it, so in the moment between saving a bill and its list
// coming back, the row genuinely is not in the copy the screen holds — and it
// is about to be. Reporting that as a failure is what put "Couldn't load" on a
// shared expense that had just been saved successfully: nothing had failed, the
// screen was simply reading a list older than the thing it was looking for.
//
// `isSettled` is the caller's answer to "has the list stopped moving" — which
// is isFetching, and deliberately not isStale. Staleness is a cache-tuning
// number; whether a row exists is not, and a screen whose message changed after
// thirty idle seconds would be reporting the staleTime rather than the data.
export const resolveRowState = ({ isPending, hasData, error, hasRow, isSettled }) => {
    const state = resolveViewState({ isPending, hasData, error });

    // A failure, or nothing to read at all, is answered the same way it always
    // was — a missing row says nothing about either.
    if (state !== CONTENT || hasRow) {
        return state;
    }

    return isSettled ? MISSING : LOADING;
};
