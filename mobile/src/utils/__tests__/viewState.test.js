import { resolveViewState, LOADING, ERROR, EMPTY, CONTENT } from '../viewState';

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
