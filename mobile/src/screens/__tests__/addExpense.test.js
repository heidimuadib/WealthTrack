import React from 'react';
import { Keyboard, TextInput, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { ThemeProvider } from '../../theme';
import { LanguageProvider } from '../../i18n';
import { FeedbackProvider } from '../../components/FeedbackProvider';
import { STRINGS } from '../../i18n/strings';
import AddExpenseScreen from '../AddExpenseScreen';

// The screen's only use of navigation context is useRefreshOnFocus, which
// wants a real navigator. Everything under test here is local state, so the
// hook is stubbed rather than the whole tree wrapped in a container.
jest.mock('@react-navigation/native', () => ({
    useFocusEffect: jest.fn(),
}));

const EN = STRINGS.en;
const trigger = ReactNativeHapticFeedback.trigger;

const FOOD = { id: 1, name: 'Food & Dining', color: '#C2703D' };
const TRANSPORT = { id: 2, name: 'Transport', color: '#3D7EA6' };

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

// The snackbar inside FeedbackProvider reads safe-area insets, which are
// measured natively and therefore never arrive under Jest. Supplying them up
// front is what the library documents for exactly this case.
const SAFE_AREA = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

let navigation;
let client;
let keyboardHandlers;
let removeListener;
let noteFocus;
let noteBlur;
let mounted = [];

const render = async ({ categories = [FOOD, TRANSPORT], expense = null } = {}) => {
    client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    // Seeded rather than fetched: a query with data and an infinite staleTime
    // never reaches the network, so nothing here depends on axios.
    client.setQueryData(['categories'], categories);

    let tree;
    await act(async () => {
        tree = renderer.create(
            <QueryClientProvider client={client}>
                <ThemeProvider>
                    <LanguageProvider>
                        <SafeAreaProvider initialMetrics={SAFE_AREA}>
                            <FeedbackProvider>
                                <AddExpenseScreen
                                    navigation={navigation}
                                    route={{ params: expense ? { expense } : {} }}
                                />
                            </FeedbackProvider>
                        </SafeAreaProvider>
                    </LanguageProvider>
                </ThemeProvider>
            </QueryClientProvider>
        );
    });
    mounted.push(tree);
    return tree;
};

const touchables = (tree) => tree.root.findAllByType(TouchableOpacity);

const byLabel = (tree, label) =>
    touchables(tree).find((node) => node.props.accessibilityLabel === label);

const amountRow = (tree) =>
    touchables(tree).find((node) =>
        String(node.props.accessibilityLabel || '').startsWith(`${EN['add.amountLabel']} ₱`)
    );

const amountShown = (tree) =>
    String(amountRow(tree).props.accessibilityLabel).replace(`${EN['add.amountLabel']} ₱`, '');

const keypadDigits = (tree) =>
    touchables(tree).filter((node) => DIGITS.includes(node.props.accessibilityLabel));

const hasKeypad = (tree) => keypadDigits(tree).length === DIGITS.length;

const noteInput = (tree) =>
    tree.root.findAll((node) => typeof node.type === 'string' && node.type === 'TextInput')[0];

const texts = (tree) =>
    tree.root
        .findAll((node) => typeof node.type === 'string' && node.type === 'Text')
        .flatMap((node) => node.children)
        .filter((child) => typeof child === 'string');

const press = async (node) => act(async () => node.props.onPress());
const longPress = async (node) => act(async () => node.props.onLongPress());
const tapKey = async (tree, label) => press(byLabel(tree, label));

const typeAmount = async (tree, digits) => {
    for (const digit of digits.split('')) {
        // Re-queried each time: pressing a key re-renders the whole keypad.
        await tapKey(tree, digit);
    }
};

const revealAndFocusNote = async (tree) => {
    await press(byLabel(tree, EN['add.addNote']));
    await act(async () => noteInput(tree).props.onFocus());
};

beforeEach(() => {
    // First, not last: a test that leaves a tree in a bad state would
    // otherwise skip the restore in afterEach and let every spy below carry
    // the previous test's calls into this one.
    jest.restoreAllMocks();

    navigation = { navigate: jest.fn(), goBack: jest.fn() };
    keyboardHandlers = {};
    removeListener = jest.fn();
    // React Native's Jest preset renders TextInput as a class whose focus and
    // blur are inert prototype stubs, and the ref the screen holds is that
    // class instance — so the prototype is where the calls can be seen.
    noteFocus = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(() => {});
    noteBlur = jest.spyOn(TextInput.prototype, 'blur').mockImplementation(() => {});
    trigger.mockReset();
    trigger.mockImplementation(() => {});

    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, handler) => {
        keyboardHandlers[event] = handler;
        return { remove: removeListener };
    });
    jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});

    [noteFocus, noteBlur, Keyboard.addListener, Keyboard.dismiss].forEach((spy) =>
        spy.mockClear()
    );
});

afterEach(async () => {
    try {
        await act(async () => {
            mounted.forEach((tree) => tree.unmount());
        });
    } finally {
        mounted = [];
        jest.restoreAllMocks();
    }
});

describe('the note and keypad cannot both be gone', () => {
    it('hides the keypad only while the note actually has focus', async () => {
        const tree = await render();
        expect(hasKeypad(tree)).toBe(true);

        await press(byLabel(tree, EN['add.addNote']));
        // Revealed but not yet reported as focused — the keypad stays.
        expect(hasKeypad(tree)).toBe(true);

        await act(async () => noteInput(tree).props.onFocus());
        expect(hasKeypad(tree)).toBe(false);
    });

    it('restores the keypad when the keyboard goes without a blur', async () => {
        // Android's back button and back gesture both do exactly this: the IME
        // closes, the field keeps focus, and onBlur never fires. Without the
        // listener the screen is left with no keyboard and no keypad.
        const tree = await render();
        await revealAndFocusNote(tree);
        expect(hasKeypad(tree)).toBe(false);

        await act(async () => keyboardHandlers.keyboardDidHide());

        expect(hasKeypad(tree)).toBe(true);
        // The flag alone is not enough: React Native still believes the field
        // is focused until it is blurred, so the next tap on it would be a
        // no-op and the keyboard would never come back either.
        expect(noteBlur).toHaveBeenCalled();
    });

    it('leaves the note itself alone when the keyboard goes', async () => {
        const tree = await render();
        await revealAndFocusNote(tree);
        await act(async () => noteInput(tree).props.onChangeText('lunch with the team'));

        await act(async () => keyboardHandlers.keyboardDidHide());

        expect(noteInput(tree).props.value).toBe('lunch with the team');
    });

    it('still handles an ordinary blur', async () => {
        const tree = await render();
        await revealAndFocusNote(tree);

        await act(async () => noteInput(tree).props.onBlur());

        expect(hasKeypad(tree)).toBe(true);
    });

    it('subscribes once and unsubscribes on unmount', async () => {
        const tree = await render();
        const subscriptions = Keyboard.addListener.mock.calls.filter(
            ([event]) => event === 'keyboardDidHide'
        );
        expect(subscriptions).toHaveLength(1);

        await act(async () => tree.unmount());
        mounted = mounted.filter((t) => t !== tree);

        expect(removeListener).toHaveBeenCalledTimes(1);
    });
});

describe('tapping the amount', () => {
    it('brings the keypad back while the note has focus', async () => {
        const tree = await render();
        await revealAndFocusNote(tree);
        expect(hasKeypad(tree)).toBe(false);

        await press(amountRow(tree));

        expect(hasKeypad(tree)).toBe(true);
        expect(noteBlur).toHaveBeenCalled();
        expect(Keyboard.dismiss).toHaveBeenCalled();
    });

    it('changes neither the amount nor the note', async () => {
        const tree = await render();
        await typeAmount(tree, '1234');
        await revealAndFocusNote(tree);
        await act(async () => noteInput(tree).props.onChangeText('jeepney'));

        await press(amountRow(tree));

        expect(amountShown(tree)).toBe('1,234');
        expect(noteInput(tree)).toBeTruthy();
        expect(noteInput(tree).props.value).toBe('jeepney');
    });

    it('navigates nowhere and buzzes about nothing', async () => {
        const tree = await render();
        await press(amountRow(tree));

        expect(navigation.navigate).not.toHaveBeenCalled();
        expect(navigation.goBack).not.toHaveBeenCalled();
        expect(trigger).not.toHaveBeenCalled();
    });
});

describe('revealing the note', () => {
    it('focuses it exactly once', async () => {
        const tree = await render();

        await press(byLabel(tree, EN['add.addNote']));
        expect(noteFocus).toHaveBeenCalledTimes(1);

        // Any later render must not pull focus back off the keypad.
        await typeAmount(tree, '55');
        expect(noteFocus).toHaveBeenCalledTimes(1);
    });

    it('does not steal focus back after the keyboard has been dismissed', async () => {
        const tree = await render();
        await revealAndFocusNote(tree);
        await act(async () => keyboardHandlers.keyboardDidHide());

        await typeAmount(tree, '7');

        expect(noteFocus).toHaveBeenCalledTimes(1);
    });

    it('does not focus a note that arrived with an edited expense', async () => {
        // The field is on screen from the first render here, so an autoFocus
        // prop would open the keyboard over the keypad on arrival.
        await render({
            expense: {
                id: 9,
                amount: 250,
                notes: 'team dinner',
                date: new Date('2026-08-02T10:00:00Z').toISOString(),
                categoryId: FOOD.id,
                category: FOOD,
            },
        });

        expect(noteFocus).not.toHaveBeenCalled();
    });
});

describe('delete', () => {
    it('removes one digit on a short press', async () => {
        const tree = await render();
        await typeAmount(tree, '120');
        expect(amountShown(tree)).toBe('120');

        await tapKey(tree, EN['add.keyDelete']);

        expect(amountShown(tree)).toBe('12');
    });

    it('clears the whole amount on a long press', async () => {
        const tree = await render();
        await typeAmount(tree, '1234');
        expect(amountShown(tree)).toBe('1,234');

        await longPress(byLabel(tree, EN['add.keyDelete']));

        expect(amountShown(tree)).toBe('0');
    });

    it('buzzes once for the clear, and never per digit', async () => {
        const tree = await render();
        await typeAmount(tree, '1234');
        expect(trigger).not.toHaveBeenCalled();

        await longPress(byLabel(tree, EN['add.keyDelete']));
        expect(trigger).toHaveBeenCalledTimes(1);

        // Nothing left to clear, so nothing to confirm.
        await longPress(byLabel(tree, EN['add.keyDelete']));
        expect(trigger).toHaveBeenCalledTimes(1);
    });

    it('leaves the note, the category and the date untouched', async () => {
        const tree = await render();
        await typeAmount(tree, '500');
        await press(byLabel(tree, EN['add.addNote']));
        await act(async () => noteInput(tree).props.onChangeText('groceries'));
        const dateBefore = byLabel(tree, EN['dates.today']);
        expect(dateBefore).toBeTruthy();

        await longPress(byLabel(tree, EN['add.keyDelete']));

        expect(amountShown(tree)).toBe('0');
        expect(noteInput(tree).props.value).toBe('groceries');
        expect(byLabel(tree, FOOD.name).props.accessibilityState).toEqual({ selected: true });
        expect(byLabel(tree, EN['dates.today'])).toBeTruthy();
    });

    it('leaves the keypad usable straight afterwards', async () => {
        const tree = await render();
        await typeAmount(tree, '1234');
        await longPress(byLabel(tree, EN['add.keyDelete']));

        await typeAmount(tree, '75');

        expect(amountShown(tree)).toBe('75');
        expect(hasKeypad(tree)).toBe(true);
    });

    it('carries a hint saying the hold is there', async () => {
        const tree = await render();
        expect(byLabel(tree, EN['add.keyDelete']).props.accessibilityHint).toBe(
            EN['add.keyDeleteHint']
        );
    });

    it('offers no long press on the digits', async () => {
        const tree = await render();
        keypadDigits(tree).forEach((key) => expect(key.props.onLongPress).toBeUndefined());
    });
});

describe('the disabled save button says why', () => {
    it('asks for an amount while there is none', async () => {
        const tree = await render();
        expect(texts(tree)).toContain(EN['add.hintAmount']);
    });

    it('drops the hint once the form is valid', async () => {
        const tree = await render();
        await typeAmount(tree, '250');

        expect(texts(tree)).not.toContain(EN['add.hintAmount']);
        expect(texts(tree)).not.toContain(EN['add.hintCategory']);
    });

    it('comes back when the amount is cleared again', async () => {
        const tree = await render();
        await typeAmount(tree, '250');
        await longPress(byLabel(tree, EN['add.keyDelete']));

        expect(texts(tree)).toContain(EN['add.hintAmount']);
    });

    it('never asks for a category while one is already chosen', async () => {
        const tree = await render();
        expect(texts(tree)).not.toContain(EN['add.hintCategory']);

        await typeAmount(tree, '250');
        expect(texts(tree)).not.toContain(EN['add.hintCategory']);
    });

    it('asks for a category only when there is genuinely none to pick', async () => {
        // Reachable on an account whose categories have all been deleted, and
        // while the first load is still in flight.
        const tree = await render({ categories: [] });
        await typeAmount(tree, '250');

        expect(texts(tree)).toContain(EN['add.hintCategory']);
    });
});

describe('the amount is one accessible element', () => {
    it('is a button carrying the whole figure', async () => {
        const tree = await render();
        await typeAmount(tree, '1234');

        const row = amountRow(tree);
        expect(row.props.accessible).toBe(true);
        expect(row.props.accessibilityRole).toBe('button');
        expect(row.props.accessibilityLabel).toBe(`${EN['add.amountLabel']} ₱1,234`);
        expect(row.props.accessibilityHint).toBe(EN['add.editAmount']);
        expect(row.props.accessibilityLiveRegion).toBe('polite');
    });

    it('does not offer the peso sign and the number as separate stops', async () => {
        const tree = await render();
        await typeAmount(tree, '99');

        const parts = amountRow(tree).findAll(
            (node) => typeof node.type === 'string' && node.type === 'Text'
        );
        expect(parts.length).toBeGreaterThan(0);
        parts.forEach((part) => {
            expect(part.props.importantForAccessibility).toBe('no-hide-descendants');
            expect(part.props.accessibilityElementsHidden).toBe(true);
        });
    });

    it('keeps a target worth aiming at', async () => {
        const tree = await render();
        const style = amountRow(tree).props.style;
        const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
        expect(flat.minHeight).toBeGreaterThanOrEqual(44);
    });
});

describe('nothing user-facing is hardcoded', () => {
    it('renders only strings the dictionaries define', async () => {
        const tree = await render();
        const dictionary = new Set(
            Object.values(EN).filter((value) => typeof value === 'string')
        );
        // Category names come from the user's own data, and the keypad glyphs
        // and the figure are numerals rather than copy. Everything else on
        // screen has to come from a dictionary key.
        const fromData = new Set([FOOD.name, TRANSPORT.name]);
        const isFigure = (text) => /^[₱\d.,]+$/.test(text);

        texts(tree)
            .filter((text) => text.trim() !== '')
            .forEach((text) => {
                if (fromData.has(text) || isFigure(text)) {
                    return;
                }
                expect({ text, translated: dictionary.has(text) }).toEqual({
                    text,
                    translated: true,
                });
            });
    });
});
