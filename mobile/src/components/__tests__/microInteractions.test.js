import React from 'react';
import { Animated, AccessibilityInfo, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { ThemeProvider } from '../../theme';
import { LanguageProvider } from '../../i18n';
import BudgetPromptCard from '../BudgetPromptCard';
import CategoryChips from '../CategoryChips';

const trigger = ReactNativeHapticFeedback.trigger;

const CATEGORIES = [
    { id: 1, name: 'Food', color: '#C2703D' },
    { id: 2, name: 'Transport', color: '#3D7EA6' },
];

let timingSpy;

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

const buttons = (tree) => tree.root.findAllByType(TouchableOpacity);

const setReducedMotion = (value) => {
    AccessibilityInfo.isReduceMotionEnabled = jest.fn(() => Promise.resolve(value));
};

beforeEach(() => {
    trigger.mockReset();
    trigger.mockImplementation(() => {});
    setReducedMotion(false);
    // Real Animated.timing would leave a one-shot running past the test; the
    // spy keeps the handle so start/stop can be asserted instead.
    timingSpy = jest.spyOn(Animated, 'timing').mockImplementation(() => ({
        start: jest.fn(),
        stop: jest.fn(),
        reset: jest.fn(),
    }));
});

afterEach(() => {
    timingSpy.mockRestore();
});

describe('category chips', () => {
    it('says nothing when the screen arrives with one already chosen', async () => {
        // The remembered category is picked for the user, not by them.
        await render(<CategoryChips categories={CATEGORIES} value={1} onChange={jest.fn()} />);

        expect(trigger).not.toHaveBeenCalled();
    });

    it('gives one light tap when a different chip is chosen', async () => {
        const onChange = jest.fn();
        const tree = await render(
            <CategoryChips categories={CATEGORIES} value={1} onChange={onChange} />
        );

        await act(async () => buttons(tree)[1].props.onPress());

        expect(onChange).toHaveBeenCalledWith(2);
        expect(trigger).toHaveBeenCalledTimes(1);
        expect(trigger).toHaveBeenCalledWith('impactLight', expect.any(Object));
    });

    it('gives one tap however fast a new chip is hit', async () => {
        // Three taps land in a single React batch, so a state-based guard
        // would still read the old selection for all three and buzz three
        // times.
        const onChange = jest.fn();
        const tree = await render(
            <CategoryChips categories={CATEGORIES} value={1} onChange={onChange} />
        );

        await act(async () => {
            buttons(tree)[1].props.onPress();
            buttons(tree)[1].props.onPress();
            buttons(tree)[1].props.onPress();
        });

        expect(trigger).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('stays quiet when the chip already chosen is tapped again', async () => {
        // Nothing changed, so there is nothing to confirm — and this is what
        // stops a double tap firing twice.
        const onChange = jest.fn();
        const tree = await render(
            <CategoryChips categories={CATEGORIES} value={1} onChange={onChange} />
        );

        await act(async () => buttons(tree)[0].props.onPress());
        await act(async () => buttons(tree)[0].props.onPress());

        expect(trigger).not.toHaveBeenCalled();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('skips the selection animation when motion is reduced', async () => {
        setReducedMotion(true);
        const tree = await render(
            <CategoryChips categories={CATEGORIES} value={1} onChange={jest.fn()} />
        );
        timingSpy.mockClear();

        await act(async () => buttons(tree)[1].props.onPress());

        expect(timingSpy).not.toHaveBeenCalled();
        // The haptic is not motion, so it still happens.
        expect(trigger).toHaveBeenCalledTimes(1);
    });

    it('keeps the animation under a quarter second', async () => {
        const tree = await render(
            <CategoryChips categories={CATEGORIES} value={1} onChange={jest.fn()} />
        );
        timingSpy.mockClear();

        await act(async () => buttons(tree)[1].props.onPress());

        const [, config] = timingSpy.mock.calls[0];
        expect(config.duration).toBeLessThanOrEqual(250);
        expect(config.useNativeDriver).toBe(true);
    });
});

describe('budget prompt dismissal', () => {
    const layout = async (tree, height = 180) => {
        const wrapper = tree.root.findAllByType(Animated.View)[0];
        await act(async () => {
            wrapper.props.onLayout({ nativeEvent: { layout: { height } } });
        });
    };

    it('taps lightly and then dismisses', async () => {
        const onDismiss = jest.fn();
        const tree = await render(
            <BudgetPromptCard onSetBudget={jest.fn()} onDismiss={onDismiss} />
        );
        await layout(tree);

        await act(async () => buttons(tree)[0].props.onPress());

        expect(trigger).toHaveBeenCalledTimes(1);
        expect(trigger).toHaveBeenCalledWith('impactLight', expect.any(Object));

        // The card leaves when the animation finishes, not before.
        const exit = timingSpy.mock.results[timingSpy.mock.results.length - 1].value;
        expect(exit.start).toHaveBeenCalled();
        expect(onDismiss).not.toHaveBeenCalled();

        await act(async () => exit.start.mock.calls[0][0]({ finished: true }));
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('dismisses once however many times it is tapped', async () => {
        const onDismiss = jest.fn();
        const tree = await render(
            <BudgetPromptCard onSetBudget={jest.fn()} onDismiss={onDismiss} />
        );
        await layout(tree);

        await act(async () => {
            buttons(tree)[0].props.onPress();
            buttons(tree)[0].props.onPress();
            buttons(tree)[0].props.onPress();
        });

        expect(trigger).toHaveBeenCalledTimes(1);
        expect(timingSpy).toHaveBeenCalledTimes(1);
    });

    it('goes straight to dismissed when motion is reduced', async () => {
        setReducedMotion(true);
        const onDismiss = jest.fn();
        const tree = await render(
            <BudgetPromptCard onSetBudget={jest.fn()} onDismiss={onDismiss} />
        );
        await layout(tree);
        timingSpy.mockClear();

        await act(async () => buttons(tree)[0].props.onPress());

        expect(timingSpy).not.toHaveBeenCalled();
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('stops the exit if the dashboard is left mid-animation', async () => {
        const tree = await render(
            <BudgetPromptCard onSetBudget={jest.fn()} onDismiss={jest.fn()} />
        );
        await layout(tree);

        await act(async () => buttons(tree)[0].props.onPress());
        const exit = timingSpy.mock.results[timingSpy.mock.results.length - 1].value;

        await act(async () => tree.unmount());

        expect(exit.stop).toHaveBeenCalled();
    });

    it('keeps the exit under a quarter second and collapses the space it held', async () => {
        const tree = await render(
            <BudgetPromptCard onSetBudget={jest.fn()} onDismiss={jest.fn()} />
        );
        await layout(tree, 180);

        await act(async () => buttons(tree)[0].props.onPress());

        const [, config] = timingSpy.mock.calls[0];
        expect(config.duration).toBeLessThanOrEqual(250);

        // Height rides the same value, so nothing below it snaps upward when
        // the card goes.
        const wrapper = tree.root.findAllByType(Animated.View)[0];
        const style = wrapper.props.style.filter(Boolean).find((s) => s && s.height);
        expect(style).toBeDefined();
    });

    it('does not vibrate when the primary action is taken instead', async () => {
        // Setting a budget navigates; the success there belongs to the save,
        // not to leaving this screen.
        const onSetBudget = jest.fn();
        const tree = await render(
            <BudgetPromptCard onSetBudget={onSetBudget} onDismiss={jest.fn()} />
        );

        await act(async () => buttons(tree)[1].props.onPress());

        expect(onSetBudget).toHaveBeenCalledTimes(1);
        expect(trigger).not.toHaveBeenCalled();
    });
});
