import React from 'react';
import { TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { ThemeProvider } from '../../theme';
import { LanguageProvider } from '../../i18n';
import { STRINGS } from '../../i18n/strings';
import CategoryFilter from '../CategoryFilter';
import SwipeableRow from '../SwipeableRow';
import { ALL_CATEGORIES } from '../../utils/expenseFilters';

const trigger = ReactNativeHapticFeedback.trigger;

const CATEGORIES = [
    { id: 1, name: 'Food & Dining', color: '#C2703D' },
    { id: 2, name: 'Transport', color: '#3D7EA6' },
];

const render = async (ui) => {
    let tree;
    await act(async () => {
        tree = renderer.create(
            <ThemeProvider>
                <LanguageProvider>{ui}</LanguageProvider>
            </ThemeProvider>
        );
    });
    return tree;
};

const chips = (tree) => tree.root.findAllByType(TouchableOpacity);

const texts = (tree) =>
    tree.root
        .findAll((node) => typeof node.type === 'string' && node.type === 'Text')
        .flatMap((node) => node.children)
        .filter((child) => typeof child === 'string');

beforeEach(() => {
    trigger.mockReset();
    trigger.mockImplementation(() => {});
});

describe('CategoryFilter', () => {
    it('offers All first, then the account’s categories', async () => {
        const tree = await render(
            <CategoryFilter categories={CATEGORIES} value={ALL_CATEGORIES} onChange={jest.fn()} />
        );

        const shown = texts(tree);
        expect(shown[0]).toBe(STRINGS.en['expenses.allCategories']);
        expect(shown).toContain('Food & Dining');
        expect(shown).toContain('Transport');
    });

    it('renders nothing at all when there are no categories', async () => {
        // A row containing only "All" is a control that cannot do anything.
        const tree = await render(
            <CategoryFilter categories={[]} value={ALL_CATEGORIES} onChange={jest.fn()} />
        );

        expect(chips(tree)).toHaveLength(0);
    });

    it('survives categories failing to load, so the list still browses', async () => {
        // The screen passes an empty array when the query errored; losing the
        // filter must not take the expenses with it.
        const tree = await render(
            <CategoryFilter categories={undefined} value={ALL_CATEGORIES} onChange={jest.fn()} />
        );

        expect(chips(tree)).toHaveLength(0);
    });

    it('announces the selection as state, not just as a colour', async () => {
        const tree = await render(
            <CategoryFilter categories={CATEGORIES} value={1} onChange={jest.fn()} />
        );

        const selectedStates = chips(tree).map((chip) => chip.props.accessibilityState?.selected);
        expect(selectedStates).toEqual([false, true, false]);
    });

    it('reports a change with one light tap', async () => {
        const onChange = jest.fn();
        const tree = await render(
            <CategoryFilter categories={CATEGORIES} value={ALL_CATEGORIES} onChange={onChange} />
        );

        await act(async () => chips(tree)[1].props.onPress());

        expect(onChange).toHaveBeenCalledWith(1);
        expect(trigger).toHaveBeenCalledTimes(1);
        expect(trigger).toHaveBeenCalledWith('impactLight', expect.any(Object));
    });

    it('says nothing when the chip already chosen is tapped again', async () => {
        const onChange = jest.fn();
        const tree = await render(
            <CategoryFilter categories={CATEGORIES} value={1} onChange={onChange} />
        );

        await act(async () => {
            chips(tree)[1].props.onPress();
            chips(tree)[1].props.onPress();
        });

        expect(onChange).not.toHaveBeenCalled();
        expect(trigger).not.toHaveBeenCalled();
    });

    it('gives every chip a target of at least 44pt', async () => {
        const tree = await render(
            <CategoryFilter categories={CATEGORIES} value={ALL_CATEGORIES} onChange={jest.fn()} />
        );

        chips(tree).forEach((chip) => {
            const style = [].concat(chip.props.style).find((s) => s && s.height);
            expect(style.height).toBeGreaterThanOrEqual(44);
        });
    });

    it('truncates a long category name rather than stretching the row', async () => {
        const long = [{ id: 3, name: 'Groceries, household and everything else', color: '#000' }];
        const tree = await render(
            <CategoryFilter categories={long} value={ALL_CATEGORIES} onChange={jest.fn()} />
        );

        const label = tree.root
            .findAll((node) => typeof node.type === 'string' && node.type === 'Text')
            .find((node) => node.children[0] === long[0].name);

        expect(label.props.numberOfLines).toBe(1);
    });
});

describe('SwipeableRow', () => {
    it('does not delete from the swipe itself, only from the revealed action', async () => {
        // A gesture that deletes on crossing a threshold turns a mis-scroll
        // into lost data, and this list is somebody's financial record.
        const onDelete = jest.fn();
        const tree = await render(
            <SwipeableRow onDelete={onDelete} onSwipeOpen={jest.fn()}>
                <></>
            </SwipeableRow>
        );

        const swipeable = tree.root.children.find(() => true);
        expect(swipeable).toBeDefined();
        expect(onDelete).not.toHaveBeenCalled();

        await act(async () => tree.unmount());
    });

    it('names its action for a screen reader, in every language', async () => {
        const tree = await render(
            <SwipeableRow onDelete={jest.fn()} onSwipeOpen={jest.fn()}>
                <></>
            </SwipeableRow>
        );

        // The action panel is rendered lazily by Swipeable, so the label is
        // asserted from the dictionary the component reads.
        expect(STRINGS.en['expenses.deleteAction']).toBe('Delete');
        ['en', 'fil', 'ceb'].forEach((code) => {
            expect(STRINGS[code]['expenses.deleteAction'].trim()).not.toBe('');
        });

        // Swipeable holds an Animated value; unmounting stops it rather than
        // leaving it ticking past the end of the test.
        await act(async () => tree.unmount());
    });
});
