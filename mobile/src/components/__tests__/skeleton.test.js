import React from 'react';
import { Animated } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { ThemeProvider } from '../../theme';
import { LanguageProvider } from '../../i18n';
import { SkeletonGroup, SkeletonBlock, SkeletonListRow } from '../Skeleton';
import {
    DashboardSkeleton,
    ExpenseListSkeleton,
    BudgetSkeleton,
    ReportsSkeleton,
    CategoryListSkeleton,
    CategoryChipsSkeleton,
} from '../ScreenSkeletons';

// Both providers read AsyncStorage on mount, so every render is wrapped in an
// async act to let those effects settle before anything is asserted.
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

// Host nodes only. findAll walks composite components too, so an <View> shows
// up twice — once as the RN component, once as the platform view it renders —
// and every "how many of these are there" assertion doubles without this.
const hosts = (tree, predicate) =>
    tree.root.findAll((node) => typeof node.type === 'string' && predicate(node));

const textNodes = (tree) => hosts(tree, (node) => node.type === 'Text');

const allText = (tree) =>
    textNodes(tree)
        .flatMap((node) => node.children)
        .filter((child) => typeof child === 'string');

// The pulse is an endless Animated.loop. Left running it holds the test
// process open forever, so every test here drives a stubbed loop and asserts
// on how it was used rather than watching it animate.
let loopSpy;

beforeEach(() => {
    loopSpy = jest.spyOn(Animated, 'loop').mockImplementation(() => ({
        start: jest.fn(),
        stop: jest.fn(),
        reset: jest.fn(),
    }));
});

afterEach(() => {
    loopSpy.mockRestore();
});

const SCREENS = [
    ['DashboardSkeleton', <DashboardSkeleton />],
    ['ExpenseListSkeleton', <ExpenseListSkeleton />],
    ['BudgetSkeleton', <BudgetSkeleton />],
    ['ReportsSkeleton', <ReportsSkeleton />],
    ['CategoryListSkeleton', <CategoryListSkeleton />],
    ['CategoryChipsSkeleton', <CategoryChipsSkeleton />],
];

describe('skeletons show no data', () => {
    // The rule the whole feature rests on. A placeholder that renders ₱0, or
    // "0%", has made a false statement about the user's money that they will
    // believe for as long as it is on screen.
    it.each(SCREENS)('%s renders no text at all', async (_name, element) => {
        const tree = await render(element);
        expect(allText(tree)).toEqual([]);
    });

    it.each(SCREENS)('%s renders no text element at all', async (_name, element) => {
        // Stronger than "no strings": there is no Text node to later be given
        // a peso figure by a well-meaning edit.
        const tree = await render(element);
        expect(textNodes(tree)).toEqual([]);
    });
});

describe('accessibility', () => {
    it('announces the screen once rather than naming every block', async () => {
        const tree = await render(<DashboardSkeleton />);

        const labelled = hosts(
            tree,
            (node) => node.props?.accessible === true && !!node.props?.accessibilityLabel
        );

        expect(labelled).toHaveLength(1);
        expect(labelled[0].props.accessibilityLabel).toBe('Loading your dashboard');
    });

    it('gives each screen its own announcement, translated', async () => {
        const expected = {
            DashboardSkeleton: 'Loading your dashboard',
            ExpenseListSkeleton: 'Loading your expenses',
            BudgetSkeleton: 'Loading your budget',
            ReportsSkeleton: 'Loading your reports',
            CategoryListSkeleton: 'Loading your categories',
        };

        for (const [name, element] of SCREENS.filter(([n]) => expected[n])) {
            const tree = await render(element);
            const [group] = hosts(tree, (node) => node.props?.accessible === true);
            expect({ name, label: group.props.accessibilityLabel }).toEqual({
                name,
                label: expected[name],
            });
        }
    });

    it('hides the individual blocks from screen readers', async () => {
        const tree = await render(
            <SkeletonGroup label="Loading">
                <SkeletonBlock width={100} />
                <SkeletonListRow />
            </SkeletonGroup>
        );

        const blocks = tree.root.findAllByType(Animated.View);
        expect(blocks.length).toBeGreaterThan(0);
        blocks.forEach((block) => {
            expect(block.props.accessibilityElementsHidden).toBe(true);
            expect(block.props.importantForAccessibility).toBe('no-hide-descendants');
        });
    });
});

describe('animation', () => {
    it('runs one loop for the whole group, not one per block', async () => {
        // Fourteen-odd blocks; a value per block would mean fourteen loops
        // driving the same pulse slightly out of step.
        await render(<DashboardSkeleton />);

        expect(loopSpy).toHaveBeenCalledTimes(1);
    });

    it('starts the loop on mount and stops it on unmount', async () => {
        const tree = await render(<DashboardSkeleton />);

        const { start, stop } = loopSpy.mock.results[0].value;
        expect(start).toHaveBeenCalled();
        expect(stop).not.toHaveBeenCalled();

        // Data arrives, the skeleton goes away, and the animation has to go
        // with it — otherwise it drives a detached node for the life of the
        // app.
        await act(async () => {
            tree.unmount();
        });

        expect(stop).toHaveBeenCalled();
    });

    it('drives opacity on the native thread so a busy render cannot stutter it', async () => {
        const timing = jest.spyOn(Animated, 'timing');
        timing.mockClear();

        await render(<CategoryChipsSkeleton />);

        expect(timing).toHaveBeenCalled();
        timing.mock.calls.forEach(([, config]) => {
            expect(config.useNativeDriver).toBe(true);
        });
        timing.mockRestore();
    });
});
