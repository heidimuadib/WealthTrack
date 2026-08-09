import {
    resolveViewState,
    resolveRowState,
    LOADING,
    ERROR,
    EMPTY,
    CONTENT,
    MISSING,
} from '../viewState';

// React Query's own vocabulary, so each case reads as the situation it stands
// for rather than a bag of booleans.
const firstLoad = { isPending: true, hasData: false, error: undefined };
const refetching = { isPending: false, hasData: true, error: undefined };
const loaded = { isPending: false, hasData: true, error: undefined };

describe('resolveViewState', () => {
    it('shows the skeleton on a first load with nothing cached', () => {
        expect(resolveViewState(firstLoad)).toBe(LOADING);
    });

    it('keeps cached content on screen while it refetches', () => {
        // The whole point of reading isPending rather than isFetching: a
        // background refresh must never blank out figures already on screen.
        expect(resolveViewState(refetching)).toBe(CONTENT);
        expect(resolveViewState({ ...refetching, isPending: false })).toBe(CONTENT);
    });

    it('drops the skeleton once data has arrived', () => {
        expect(resolveViewState(firstLoad)).toBe(LOADING);
        expect(resolveViewState(loaded)).toBe(CONTENT);
    });

    it('shows the error state when the first load fails', () => {
        expect(
            resolveViewState({ isPending: false, hasData: false, error: new Error('nope') })
        ).toBe(ERROR);
    });

    it('never leaves an error hidden behind an endless skeleton', () => {
        // A query that is retrying still reports isPending, but once it has
        // given up and produced an error with nothing cached, the screen has
        // to say so rather than pulse forever.
        expect(
            resolveViewState({ isPending: false, hasData: false, error: new Error('nope') })
        ).not.toBe(LOADING);
    });

    it('prefers cached content over a full-screen error when a refresh fails', () => {
        // The banner handles this case; throwing away readable figures to
        // announce a failed background refresh would be a downgrade.
        expect(
            resolveViewState({ isPending: false, hasData: true, error: new Error('nope') })
        ).toBe(CONTENT);
    });

    it('shows the empty state only after a successful empty response', () => {
        expect(resolveViewState({ ...loaded, isEmpty: true })).toBe(EMPTY);
    });

    it('does not mistake "nothing fetched yet" for "nothing there"', () => {
        // isEmpty is usually computed from `data ?? []`, so it reads true
        // before the first response too. Requiring hasData is what stops a
        // cold start flashing "No expenses this month".
        expect(resolveViewState({ isPending: true, hasData: false, isEmpty: true })).toBe(
            LOADING
        );
        expect(
            resolveViewState({
                isPending: false,
                hasData: false,
                isEmpty: true,
                error: new Error('nope'),
            })
        ).toBe(ERROR);
    });

    it('defaults isEmpty to false so callers without an empty branch get content', () => {
        expect(resolveViewState({ isPending: false, hasData: true })).toBe(CONTENT);
    });
});

describe('resolveRowState', () => {
    // A screen showing one bill out of the group's list of them.
    const listed = { isPending: false, hasData: true, error: undefined, hasRow: true };
    const notListed = { ...listed, hasRow: false };

    it('shows the row when it is there', () => {
        expect(resolveRowState({ ...listed, isSettled: true })).toBe(CONTENT);
    });

    // The bug this exists for. Saving a shared expense refetches the list it
    // belongs to and hands over to the screen for that expense at once, so for
    // as long as the refetch takes, the row is not in the list the screen
    // holds. It has to wait, not accuse the network.
    it('waits rather than reporting a failure while the list is still moving', () => {
        expect(resolveRowState({ ...notListed, isSettled: false })).toBe(LOADING);
    });

    it('calls the row missing only once the list has stopped moving', () => {
        expect(resolveRowState({ ...notListed, isSettled: true })).toBe(MISSING);
    });

    it('never turns a real failure into a missing row', () => {
        // Nothing cached and the fetch failed: that is an error, whatever the
        // row situation is, and a "this was deleted" message would be a lie
        // about somebody's money.
        expect(
            resolveRowState({
                isPending: false,
                hasData: false,
                error: new Error('offline'),
                hasRow: false,
                isSettled: true,
            })
        ).toBe(ERROR);
    });

    it('never turns a first load into a missing row', () => {
        expect(
            resolveRowState({
                isPending: true,
                hasData: false,
                error: undefined,
                hasRow: false,
                isSettled: false,
            })
        ).toBe(LOADING);
    });
});
