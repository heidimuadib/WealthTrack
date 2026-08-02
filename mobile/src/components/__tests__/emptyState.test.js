import React from 'react';
import { TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { ThemeProvider } from '../../theme';
import { LanguageProvider } from '../../i18n';
import { STRINGS } from '../../i18n/strings';
import EmptyState from '../EmptyState';
import BudgetPromptCard from '../BudgetPromptCard';

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

const hosts = (tree, predicate) =>
    tree.root.findAll((node) => typeof node.type === 'string' && predicate(node));

const texts = (tree) =>
    hosts(tree, (node) => node.type === 'Text')
        .flatMap((node) => node.children)
        .filter((child) => typeof child === 'string');

// Matched by component type rather than by "has an onPress", because
// TouchableOpacity's own internals carry one too and would be counted as
// extra buttons.
const pressables = (tree) => tree.root.findAllByType(TouchableOpacity);

describe('EmptyState', () => {
    it('shows a headline and an explanation', async () => {
        const tree = await render(
            <EmptyState title="No expenses yet" message="Add your first expense." />
        );

        expect(texts(tree)).toContain('No expenses yet');
        expect(texts(tree)).toContain('Add your first expense.');
    });

    it('offers no button when there is no action to take', async () => {
        // A dead-end state is better than a button that does nothing.
        const tree = await render(<EmptyState title="No matches" message="Nothing found." />);

        expect(texts(tree)).not.toContain('undefined');
        expect(pressables(tree)).toHaveLength(0);
    });

    it('runs the action when its button is pressed', async () => {
        const onAction = jest.fn();
        const tree = await render(
            <EmptyState title="No categories" actionLabel="Add category" onAction={onAction} />
        );

        await act(async () => {
            pressables(tree)[0].props.onPress();
        });

        expect(onAction).toHaveBeenCalledTimes(1);
    });

    it('gives its action a target that clears the 44pt minimum', async () => {
        // Empty-state actions are the buttons people reach for one-handed
        // after something did not go the way they expected.
        const tree = await render(
            <EmptyState title="No categories" actionLabel="Add category" onAction={jest.fn()} />
        );

        const heights = hosts(tree, (node) => node.props?.style)
            .flatMap((node) => (Array.isArray(node.props.style) ? node.props.style : [node.props.style]))
            .filter(Boolean)
            .map((style) => style.height)
            .filter((height) => typeof height === 'number');

        expect(Math.max(...heights)).toBeGreaterThanOrEqual(44);
    });
});

describe('BudgetPromptCard', () => {
    it('explains what a budget gets you rather than just naming the control', async () => {
        const tree = await render(<BudgetPromptCard onSetBudget={jest.fn()} onDismiss={jest.fn()} />);

        const shown = texts(tree);
        expect(shown).toContain(STRINGS.en['budgetPrompt.title']);
        expect(shown).toContain(STRINGS.en['budgetPrompt.body']);
        expect(shown).toContain(STRINGS.en['budgetPrompt.action']);
    });

    it('shows no amount of any kind', async () => {
        // A prompt that invented a figure would be making a claim about
        // somebody's money before they had entered any.
        const tree = await render(<BudgetPromptCard onSetBudget={jest.fn()} onDismiss={jest.fn()} />);

        expect(texts(tree).join(' ')).not.toMatch(/₱|\d/);
    });

    it('can be set up or dismissed, and each does only its own job', async () => {
        const onSetBudget = jest.fn();
        const onDismiss = jest.fn();
        const tree = await render(
            <BudgetPromptCard onSetBudget={onSetBudget} onDismiss={onDismiss} />
        );

        const buttons = pressables(tree);
        expect(buttons).toHaveLength(2);

        await act(async () => buttons[0].props.onPress());
        expect(onDismiss).toHaveBeenCalledTimes(1);
        expect(onSetBudget).not.toHaveBeenCalled();

        await act(async () => buttons[1].props.onPress());
        expect(onSetBudget).toHaveBeenCalledTimes(1);
    });

    it('labels the dismiss control for a screen reader', async () => {
        const tree = await render(<BudgetPromptCard onSetBudget={jest.fn()} onDismiss={jest.fn()} />);

        const labelled = hosts(tree, (node) => !!node.props?.accessibilityLabel).map(
            (node) => node.props.accessibilityLabel
        );

        expect(labelled).toContain(STRINGS.en['budgetPrompt.dismiss']);
    });

    it('has wording in every language', async () => {
        ['en', 'fil', 'ceb'].forEach((code) => {
            ['budgetPrompt.title', 'budgetPrompt.body', 'budgetPrompt.action', 'budgetPrompt.dismiss'].forEach(
                (key) => {
                    expect(typeof STRINGS[code][key]).toBe('string');
                    expect(STRINGS[code][key].trim()).not.toBe('');
                }
            );
        });
    });
});
