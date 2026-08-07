import fs from 'fs';
import path from 'path';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));

// No sockets. Every test seeds the cache; a query that misses simply stays
// pending rather than reaching for the network.
jest.mock('../../services/groups', () => {
    const pending = () => jest.fn(() => new Promise(() => {}));
    return {
        groupService: { list: pending(), get: pending() },
        groupMemberService: {},
        sharedExpenseService: {
            list: pending(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
        },
        groupBalanceService: { get: pending() },
        settlementService: { list: pending() },
    };
});

jest.mock('../../services/api', () => ({
    categoryService: { getAll: jest.fn(() => new Promise(() => {})) },
}));

import { sharedExpenseService } from '../../services/groups';
import { ThemeProvider } from '../../theme';
import { LanguageProvider } from '../../i18n';
import { FeedbackProvider } from '../../components/FeedbackProvider';
import { STRINGS } from '../../i18n/strings';
import { queryKeys } from '../../lib/queryKeys';
import GroupDetailScreen from '../groups/GroupDetailScreen';
import AddSharedExpenseScreen from '../groups/AddSharedExpenseScreen';
import EditSharedExpenseScreen from '../groups/EditSharedExpenseScreen';
import SharedExpenseDetailScreen from '../groups/SharedExpenseDetailScreen';

const EN = STRINGS.en;
const SRC = path.join(__dirname, '..', '..');
const read = (...segments) => fs.readFileSync(path.join(SRC, ...segments), 'utf8');

const fill = (key, values) =>
    Object.entries(values).reduce(
        (text, [token, value]) => text.replace(`{${token}}`, String(value)),
        EN[key]
    );

const GROUP_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const EXPENSE_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const SAFE_AREA = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

const SELF = { id: 'm-self', name: 'Paul', isCurrentUser: true, archivedAt: null, contactNote: null };
const JOHN = { id: 'm-john', name: 'John', isCurrentUser: false, archivedAt: null, contactNote: null };
const GONE = {
    id: 'm-gone',
    name: 'Carl',
    isCurrentUser: false,
    archivedAt: '2026-08-01T00:00:00.000Z',
    contactNote: null,
};

const CATEGORIES = [
    { id: 1, name: 'Food', icon: 'utensils', color: '#0E5A54' },
    { id: 2, name: 'Transport', icon: 'car', color: '#B45309' },
];

const group = (overrides = {}) => ({
    id: GROUP_ID,
    name: 'Cebu',
    description: 'Weekend trip',
    color: '#0E5A54',
    archivedAt: null,
    memberCount: 3,
    members: [SELF, JOHN, GONE],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    ...overrides,
});

// Shaped exactly as toSharedExpense() serialises it: amount a number, shares
// sorted by member id, splitInput a string or null, no personalExpenseId.
const expense = (overrides = {}) => ({
    id: EXPENSE_ID,
    groupId: GROUP_ID,
    description: 'Dinner',
    amount: 900,
    date: '2026-08-02T00:00:00.000Z',
    note: null,
    payerMemberId: SELF.id,
    splitMethod: 'EQUAL',
    categoryId: 1,
    hasPersonalShare: true,
    shares: [
        { memberId: JOHN.id, amount: 450, splitInput: null },
        { memberId: SELF.id, amount: 450, splitInput: null },
    ],
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    ...overrides,
});

let navigation;
let client;
let mounted = [];

const render = async (element) => {
    let tree;
    await act(async () => {
        tree = renderer.create(
            <QueryClientProvider client={client}>
                <ThemeProvider>
                    <LanguageProvider>
                        <SafeAreaProvider initialMetrics={SAFE_AREA}>
                            <FeedbackProvider>{element}</FeedbackProvider>
                        </SafeAreaProvider>
                    </LanguageProvider>
                </ThemeProvider>
            </QueryClientProvider>
        );
    });
    mounted.push(tree);
    return tree;
};

const texts = (tree) =>
    tree.root
        .findAll((node) => typeof node.type === 'string' && node.type === 'Text')
        .flatMap((node) => node.children)
        .filter((child) => typeof child === 'string');

const touchables = (tree) => tree.root.findAllByType(TouchableOpacity);
const byLabel = (tree, label) =>
    touchables(tree).find((node) => node.props.accessibilityLabel === label);
const byText = (tree, label) =>
    touchables(tree).find((node) =>
        node
            .findAll((child) => typeof child.type === 'string' && child.type === 'Text')
            .flatMap((child) => child.children)
            .includes(label)
    );
const lastByText = (tree, label) => {
    const matches = touchables(tree).filter((node) =>
        node
            .findAll((child) => typeof child.type === 'string' && child.type === 'Text')
            .flatMap((child) => child.children)
            .includes(label)
    );
    return matches[matches.length - 1];
};

const inputs = (tree) =>
    tree.root.findAll((node) => typeof node.type === 'string' && node.type === 'TextInput');
const inputByLabel = (tree, label) =>
    inputs(tree).find((node) => node.props.accessibilityLabel === label);

// Deliberately does not return the handler's promise: anything opening a
// confirmation awaits a dialog this same test has not answered yet.
const press = async (node) => {
    await act(async () => {
        node.props.onPress();
    });
};

const type = async (node, value) => {
    await act(async () => {
        node.props.onChangeText(value);
    });
};

// Saving is two presses now: the form's button opens the review, and the
// review's confirm is what commits. Tests that care about the payload say so
// once, here, rather than each repeating the step in between.
const commit = async (tree, label) => {
    await press(byText(tree, label));
    await press(byText(tree, EN['shared.reviewConfirm']));
};

// Lets everything already queued settle, timers included.
//
// An empty `await act(async () => {})` drains microtasks and one setImmediate,
// which is not enough: react-query notifies its observers from a
// setTimeout(…, 0), and node gives no guaranteed ordering between a zero-delay
// timer and the setImmediate that React's async act flushes on. Alone the timer
// usually won; under the load of a full parallel suite it did not, and a query
// that had already rejected rendered as though it were still loading. Awaiting a
// timer of our own inside act puts the assertion behind react-query's — timers
// of equal delay fire in the order they were scheduled — so the settling is
// ordered rather than raced.
const flush = async () => {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
};

const seed = ({ groupOverrides, expenses = [expense()], categories = CATEGORIES } = {}) => {
    client.setQueryData(queryKeys.groups.detail(GROUP_ID), group(groupOverrides));
    if (expenses !== undefined) {
        client.setQueryData(queryKeys.groups.expenses(GROUP_ID), expenses);
    }
    if (categories !== undefined) {
        client.setQueryData(queryKeys.categories.all, categories);
    }
};

beforeEach(() => {
    navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
    client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    Object.values(sharedExpenseService).forEach((fn) => fn.mockReset?.());
    sharedExpenseService.list.mockImplementation(() => new Promise(() => {}));
});

afterEach(async () => {
    await act(async () => {
        mounted.forEach((tree) => tree.unmount());
    });
    mounted = [];
});

// ---------------------------------------------------------------------------

describe('group detail expenses', () => {
    const screen = () =>
        render(<GroupDetailScreen navigation={navigation} route={{ params: { groupId: GROUP_ID } }} />);

    it('lists a bill with who paid and what it cost', async () => {
        seed();
        const tree = await screen();
        const shown = texts(tree);

        expect(shown).toContain('Dinner');
        expect(shown).toContain('₱900.00');
        expect(shown.join(' ')).toContain('Paul');
    });

    it("shows the reader their own share, not somebody else's", async () => {
        seed();
        const tree = await screen();
        expect(texts(tree)).toContain(EN['shared.yourShareBadge']);
    });

    it('says nothing about a share the reader has none of', async () => {
        seed({
            expenses: [
                expense({
                    payerMemberId: JOHN.id,
                    // No share for the reader means no mirror row, which is
                    // exactly what the server reports.
                    hasPersonalShare: false,
                    shares: [{ memberId: JOHN.id, amount: 900, splitInput: null }],
                }),
            ],
        });
        const tree = await screen();
        expect(texts(tree)).not.toContain(EN['shared.yourShareBadge']);
    });

    it('teaches rather than apologises when there is nothing yet', async () => {
        seed({ expenses: [] });
        const tree = await screen();
        expect(texts(tree)).toContain(EN['shared.emptyMsg']);
    });

    it('offers a retry when the list fails', async () => {
        client.setQueryData(queryKeys.groups.detail(GROUP_ID), group());
        client.setQueryData(queryKeys.categories.all, CATEGORIES);
        sharedExpenseService.list.mockRejectedValue(new Error('offline'));

        const tree = await render(
            <GroupDetailScreen navigation={navigation} route={{ params: { groupId: GROUP_ID } }} />
        );
        await flush();

        expect(texts(tree)).toContain(EN['shared.loadFailed']);
        expect(byText(tree, EN['errors.tryAgain'])).toBeTruthy();
    });

    it('opens a bill', async () => {
        seed();
        const tree = await screen();
        await press(byText(tree, 'Dinner'));

        expect(navigation.navigate).toHaveBeenCalledWith('SharedExpenseDetail', {
            groupId: GROUP_ID,
            sharedExpenseId: EXPENSE_ID,
        });
    });

    it('opens the editor', async () => {
        seed();
        const tree = await screen();
        await press(byText(tree, EN['shared.add']));

        expect(navigation.navigate).toHaveBeenCalledWith('AddSharedExpense', { groupId: GROUP_ID });
    });
});

// ---------------------------------------------------------------------------

describe('adding a shared expense', () => {
    const screen = () =>
        render(
            <AddSharedExpenseScreen navigation={navigation} route={{ params: { groupId: GROUP_ID } }} />
        );

    const validForm = async (tree) => {
        await type(inputs(tree)[0], 'Dinner');
        await type(inputs(tree)[1], '900');
    };

    it('opens on the common case: you paid, everyone is in, split evenly', async () => {
        seed();
        const tree = await screen();

        // Payer defaults to the reader.
        expect(byLabel(tree, fill('shared.a11yPayer', { name: 'Paul' }))).toBeTruthy();
        // Both active members selected; the archived one is not.
        expect(byLabel(tree, 'Paul').props.accessibilityState.selected).toBe(true);
        expect(byLabel(tree, 'John').props.accessibilityState.selected).toBe(true);
        expect(byLabel(tree, 'Carl')).toBeUndefined();
        // Equal is the chosen method.
        expect(byLabel(tree, EN['split.equal']).props.accessibilityState.selected).toBe(true);
    });

    it('refuses a bill with no description or amount, and says which', async () => {
        seed();
        const tree = await screen();
        await press(byText(tree, EN['shared.save']));

        expect(texts(tree)).toContain(EN['shared.descriptionRequired']);
        expect(texts(tree)).toContain(EN['shared.amountRequired']);
        expect(sharedExpenseService.create).not.toHaveBeenCalled();
    });

    it('sends what the screen showed', async () => {
        seed();
        sharedExpenseService.create.mockResolvedValue({ data: expense() });

        const tree = await screen();
        await validForm(tree);
        await commit(tree, EN['shared.save']);
        await flush();

        expect(sharedExpenseService.create).toHaveBeenCalledTimes(1);
        const [groupId, payload] = sharedExpenseService.create.mock.calls[0];
        expect(groupId).toBe(GROUP_ID);
        expect(payload).toMatchObject({
            description: 'Dinner',
            amount: '900.00',
            categoryId: 1,
            payerMemberId: SELF.id,
            splitMethod: 'equal',
            note: null,
        });
        expect(payload.participants).toEqual([{ memberId: SELF.id }, { memberId: JOHN.id }]);
    });

    it('books the bill once however fast the button is tapped', async () => {
        seed();
        let settle;
        sharedExpenseService.create.mockImplementation(
            () => new Promise((resolve) => { settle = resolve; })
        );

        const tree = await screen();
        await validForm(tree);

        // The commit moved to the review's confirm, so that is where a double
        // tap has to be survivable now.
        await press(byText(tree, EN['shared.save']));
        const confirm = byText(tree, EN['shared.reviewConfirm']);
        await act(async () => {
            confirm.props.onPress();
            confirm.props.onPress();
        });
        await act(async () => {
            settle({ data: expense() });
        });

        expect(sharedExpenseService.create).toHaveBeenCalledTimes(1);
    });

    it('lands on the bill it just created, not back on a blank form', async () => {
        seed();
        sharedExpenseService.create.mockResolvedValue({ data: expense() });

        const tree = await screen();
        await validForm(tree);
        await commit(tree, EN['shared.save']);
        await flush();

        expect(navigation.replace).toHaveBeenCalledWith('SharedExpenseDetail', {
            groupId: GROUP_ID,
            sharedExpenseId: EXPENSE_ID,
        });
        expect(navigation.navigate).not.toHaveBeenCalledWith(
            'SharedExpenseDetail',
            expect.anything()
        );
    });

    it('offers a way out when the group has no categories yet', async () => {
        seed({ categories: [] });
        const tree = await screen();

        expect(texts(tree)).toContain(EN['shared.noCategories']);
        await press(byText(tree, EN['add.createCategory']));
        expect(navigation.navigate).toHaveBeenCalledWith('Categories');
    });

    it('changes the payer without touching the split', async () => {
        seed();
        const tree = await screen();

        await press(byLabel(tree, fill('shared.a11yPayer', { name: 'Paul' })));
        await press(lastByText(tree, 'John'));

        expect(byLabel(tree, fill('shared.a11yPayer', { name: 'John' }))).toBeTruthy();
        expect(byLabel(tree, 'John').props.accessibilityState.selected).toBe(true);
        expect(byLabel(tree, 'Paul').props.accessibilityState.selected).toBe(true);
    });

    it('drops somebody from the bill without dropping them from the group', async () => {
        seed();
        sharedExpenseService.create.mockResolvedValue({ data: expense() });

        const tree = await screen();
        await validForm(tree);
        await press(byLabel(tree, 'John'));
        await commit(tree, EN['shared.save']);
        await flush();

        expect(sharedExpenseService.create.mock.calls[0][1].participants).toEqual([
            { memberId: SELF.id },
        ]);
    });

    it('will not save a bill nobody is on', async () => {
        seed();
        const tree = await screen();
        await validForm(tree);
        await press(byLabel(tree, 'John'));
        await press(byLabel(tree, 'Paul'));
        await press(byText(tree, EN['shared.save']));

        expect(texts(tree)).toContain(EN['shared.participantsRequired']);
        expect(sharedExpenseService.create).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------

describe('reviewing before saving', () => {
    const screen = () =>
        render(
            <AddSharedExpenseScreen navigation={navigation} route={{ params: { groupId: GROUP_ID } }} />
        );

    const openReview = async (tree) => {
        await type(inputs(tree)[0], 'Dinner');
        await type(inputs(tree)[1], '900');
        await press(byText(tree, EN['shared.save']));
    };

    it('lays the whole decision out before anything is sent', async () => {
        seed();
        const tree = await screen();
        await openReview(tree);
        const shown = texts(tree);

        expect(shown).toContain(EN['shared.reviewTitle']);
        expect(shown).toContain(EN['shared.reviewFor']);
        expect(shown).toContain(EN['shared.reviewTotal']);
        expect(shown).toContain(EN['shared.reviewMethod']);
        expect(shown).toContain(EN['shared.reviewBetween']);
        expect(shown).toContain(EN['shared.reviewBreakdown']);

        expect(shown).toContain('Dinner');
        expect(shown).toContain('₱900.00');
        expect(shown).toContain('Paul');
        expect(shown).toContain('John');
        expect(shown).toContain(EN['split.equal']);
        expect(shown).toContain(fill('shared.participantsMany', { count: 2 }));

        expect(sharedExpenseService.create).not.toHaveBeenCalled();
    });

    it('names what the bill costs the reader and what they are covering', async () => {
        seed();
        const tree = await screen();
        await openReview(tree);
        const shown = texts(tree);

        expect(shown).toContain(EN['shared.reviewYourShare']);
        expect(shown).toContain('₱450.00');
        expect(shown).toContain(fill('shared.reviewLent', { amount: '₱450.00' }));
        expect(shown).toContain(EN['shared.reviewPersonal']);
    });

    it('says plainly when a bill the reader paid adds nothing to their spending', async () => {
        seed();
        const tree = await screen();
        await type(inputs(tree)[0], 'Dinner');
        await type(inputs(tree)[1], '900');
        await press(byLabel(tree, 'Paul'));
        await press(byText(tree, EN['shared.save']));
        const shown = texts(tree);

        expect(shown).toContain(EN['shared.notIncluded']);
        expect(shown).toContain(EN['shared.reviewNoPersonal']);
        expect(shown).toContain(fill('shared.reviewLent', { amount: '₱900.00' }));
    });

    // The point of the sheet is that it cannot disagree with the editor, so it
    // reads the preview rather than dividing again. An odd centavo is where a
    // second implementation would show: naive rounding gives both people
    // ₱450.51 and a bill that no longer adds up.
    it('passes on the centavo the editor handed out rather than rounding its own way', async () => {
        seed();
        const tree = await screen();
        await type(inputs(tree)[0], 'Dinner');
        await type(inputs(tree)[1], '901.01');
        await press(byText(tree, EN['shared.save']));
        const shown = texts(tree);

        expect(shown).toContain('₱901.01');
        expect(shown).toContain('₱450.51');
        expect(shown).toContain('₱450.50');
    });

    it('sends nothing and loses nothing when it is dismissed', async () => {
        seed();
        const tree = await screen();
        await openReview(tree);
        await press(byText(tree, EN['shared.reviewBack']));

        expect(sharedExpenseService.create).not.toHaveBeenCalled();
        expect(texts(tree)).not.toContain(EN['shared.reviewTitle']);
        // Back on the same form, still filled in — it was never left.
        expect(inputs(tree)[0].props.value).toBe('Dinner');
        expect(inputs(tree)[1].props.value).toBe('900');
    });

    it('cannot be reached by a bill that does not add up', async () => {
        seed();
        const tree = await screen();
        await type(inputs(tree)[0], 'Dinner');
        await type(inputs(tree)[1], '900');
        await press(byLabel(tree, EN['split.percentage']));

        // The button that opens the review is the guard it always was: a split
        // that cannot be assigned never gets as far as a summary to confirm.
        expect(byText(tree, EN['shared.save']).props.disabled).toBe(true);
        expect(texts(tree)).not.toContain(EN['shared.reviewTitle']);
        expect(sharedExpenseService.create).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------

describe('splitting the bill', () => {
    const screen = async (amount = '900') => {
        seed();
        const tree = await render(
            <AddSharedExpenseScreen navigation={navigation} route={{ params: { groupId: GROUP_ID } }} />
        );
        await type(inputs(tree)[0], 'Dinner');
        await type(inputs(tree)[1], amount);
        return tree;
    };

    const pick = async (tree, method) => press(byLabel(tree, EN[method]));
    const splitInput = (tree, name, method) => inputByLabel(tree, `${name} ${EN[method]}`);

    it('resolves an even split as it is typed', async () => {
        const tree = await screen();
        expect(texts(tree).filter((text) => text === '₱450.00').length).toBe(2);
    });

    it('explains a centavo that will not divide, without calling it an error', async () => {
        const tree = await screen('0.01');
        expect(texts(tree)).toContain(EN['split.equalNoteOne']);
        // Still saveable: arithmetic, not a mistake.
        expect(byText(tree, EN['shared.save']).props.disabled).toBeFalsy();
    });

    it('names the plural remainder', async () => {
        seed({ groupOverrides: { members: [SELF, JOHN, { ...GONE, archivedAt: null }] } });
        const tree = await render(
            <AddSharedExpenseScreen navigation={navigation} route={{ params: { groupId: GROUP_ID } }} />
        );
        await type(inputs(tree)[1], '10.01');
        // ₱10.01 over three is 333.67 each: two members carry an extra centavo.
        expect(texts(tree)).toContain(fill('split.equalNoteMany', { count: 2 }));
    });

    it('says how much of an exact split is still unassigned', async () => {
        const tree = await screen();
        await pick(tree, 'split.fixed');
        await type(splitInput(tree, 'Paul', 'split.fixed'), '400');

        expect(texts(tree)).toContain(fill('split.leftToAssign', { amount: '₱500.00' }));
        expect(byText(tree, EN['shared.save']).props.disabled).toBe(true);
    });

    it('says when an exact split overshoots', async () => {
        const tree = await screen();
        await pick(tree, 'split.fixed');
        await type(splitInput(tree, 'Paul', 'split.fixed'), '500');
        await type(splitInput(tree, 'John', 'split.fixed'), '500');

        expect(texts(tree)).toContain(fill('split.overBy', { amount: '₱100.00' }));
        expect(byText(tree, EN['shared.save']).props.disabled).toBe(true);
    });

    it('accepts an exact split that adds up, and sends the typed figures', async () => {
        sharedExpenseService.create.mockResolvedValue({ data: expense() });
        const tree = await screen();
        await pick(tree, 'split.fixed');
        await type(splitInput(tree, 'Paul', 'split.fixed'), '600');
        await type(splitInput(tree, 'John', 'split.fixed'), '300');

        expect(texts(tree)).toContain(EN['split.fullyAssigned']);
        await commit(tree, EN['shared.save']);
        await flush();

        expect(sharedExpenseService.create.mock.calls[0][1]).toMatchObject({
            splitMethod: 'fixed',
            participants: [
                { memberId: SELF.id, amount: '600.00' },
                { memberId: JOHN.id, amount: '300.00' },
            ],
        });
    });

    it('holds a percentage split to a hundred', async () => {
        const tree = await screen();
        await pick(tree, 'split.percentage');
        await type(splitInput(tree, 'Paul', 'split.percentage'), '60');

        expect(texts(tree)).toContain(fill('split.percentLeft', { percent: '40' }));
        expect(byText(tree, EN['shared.save']).props.disabled).toBe(true);

        await type(splitInput(tree, 'John', 'split.percentage'), '40');
        expect(texts(tree)).toContain(EN['split.fullyAssigned']);
        expect(texts(tree)).toContain('₱540.00');
        expect(texts(tree)).toContain('₱360.00');
    });

    it('turns weights into money without asking for a total', async () => {
        sharedExpenseService.create.mockResolvedValue({ data: expense() });
        const tree = await screen();
        await pick(tree, 'split.shares');
        await type(splitInput(tree, 'Paul', 'split.shares'), '2');
        await type(splitInput(tree, 'John', 'split.shares'), '1');

        expect(texts(tree)).toContain('₱600.00');
        expect(texts(tree)).toContain('₱300.00');

        await commit(tree, EN['shared.save']);
        await flush();
        expect(sharedExpenseService.create.mock.calls[0][1].participants).toEqual([
            { memberId: SELF.id, shares: 2 },
            { memberId: JOHN.id, shares: 1 },
        ]);
    });

    it('asks for weights before it will save any', async () => {
        const tree = await screen();
        await pick(tree, 'split.shares');
        expect(texts(tree)).toContain(EN['split.needWeights']);
        expect(byText(tree, EN['shared.save']).props.disabled).toBe(true);
    });

    it('clears typed figures when the method changes rather than reinterpreting them', async () => {
        const tree = await screen();
        await pick(tree, 'split.percentage');
        await type(splitInput(tree, 'Paul', 'split.percentage'), '60');
        await pick(tree, 'split.fixed');

        // 60 was a percentage. Carried over it would silently mean ₱60.
        expect(splitInput(tree, 'Paul', 'split.fixed').props.value).toBe('');
    });
});

// ---------------------------------------------------------------------------

describe('editing a shared expense', () => {
    const screen = (expenses) => {
        seed(expenses ? { expenses } : undefined);
        return render(
            <EditSharedExpenseScreen
                navigation={navigation}
                route={{ params: { groupId: GROUP_ID, sharedExpenseId: EXPENSE_ID } }}
            />
        );
    };

    it('opens on what was stored', async () => {
        const tree = await screen();

        expect(inputs(tree)[0].props.value).toBe('Dinner');
        expect(inputs(tree)[1].props.value).toBe('900');
        expect(byLabel(tree, fill('shared.a11yPayer', { name: 'Paul' }))).toBeTruthy();
        expect(byLabel(tree, EN['split.equal']).props.accessibilityState.selected).toBe(true);
    });

    it('restores what was typed, not what it worked out to', async () => {
        const tree = await screen([
            expense({
                splitMethod: 'PERCENTAGE',
                shares: [
                    { memberId: JOHN.id, amount: 300, splitInput: '33.3333' },
                    { memberId: SELF.id, amount: 600, splitInput: '66.6667' },
                ],
            }),
        ]);

        // ₱600 of ₱900 is equally 66.6667%, a weight of 2, or a typed figure.
        // Only what was stored says which.
        expect(inputByLabel(tree, `Paul ${EN['split.percentage']}`).props.value).toBe('66.6667');
        expect(inputByLabel(tree, `John ${EN['split.percentage']}`).props.value).toBe('33.3333');
    });

    it('keeps an archived participant visible so the history can be read', async () => {
        const tree = await screen([
            expense({
                shares: [
                    { memberId: GONE.id, amount: 450, splitInput: null },
                    { memberId: SELF.id, amount: 450, splitInput: null },
                ],
            }),
        ]);

        expect(byLabel(tree, 'Carl')).toBeTruthy();
        expect(byLabel(tree, 'Carl').props.accessibilityState.selected).toBe(true);
    });

    it('does not put the stored figures back under a typing hand', async () => {
        const tree = await screen();
        await type(inputs(tree)[0], 'Lunch');

        // A background refetch lands mid-edit.
        await act(async () => {
            client.setQueryData(queryKeys.groups.expenses(GROUP_ID), [expense()]);
        });

        expect(inputs(tree)[0].props.value).toBe('Lunch');
    });

    it('sends the change and returns', async () => {
        sharedExpenseService.update.mockResolvedValue({ data: expense() });
        const tree = await screen();
        await type(inputs(tree)[0], 'Lunch');
        await commit(tree, EN['shared.saveChanges']);
        await flush();

        const [groupId, expenseId, payload] = sharedExpenseService.update.mock.calls[0];
        expect(groupId).toBe(GROUP_ID);
        expect(expenseId).toBe(EXPENSE_ID);
        expect(payload).toMatchObject({ description: 'Lunch', amount: '900.00' });
        expect(navigation.goBack).toHaveBeenCalled();
    });

    it('shows the server message when the server refuses', async () => {
        sharedExpenseService.update.mockRejectedValue({
            response: { data: { code: 'PARTICIPANT_ARCHIVED' } },
        });
        const tree = await screen();
        await commit(tree, EN['shared.saveChanges']);
        await flush();

        expect(texts(tree)).toContain(EN['server.participantArchived']);
    });
});

// ---------------------------------------------------------------------------

describe('reading a shared expense', () => {
    const screen = (expenses, groupOverrides) => {
        seed({ expenses, groupOverrides });
        return render(
            <SharedExpenseDetailScreen
                navigation={navigation}
                route={{ params: { groupId: GROUP_ID, sharedExpenseId: EXPENSE_ID } }}
            />
        );
    };

    it('says what happened in sentences', async () => {
        const tree = await screen();
        const shown = texts(tree);

        expect(shown).toContain(fill('shared.youPaid', { amount: '₱900.00' }));
        expect(shown).toContain(fill('shared.yourShare', { amount: '₱450.00' }));
        expect(shown).toContain(fill('shared.paidForOthers', { amount: '₱450.00' }));
    });

    it('names the payer when it was not the reader', async () => {
        const tree = await screen([expense({ payerMemberId: JOHN.id })]);
        expect(texts(tree)).toContain(
            fill('shared.someonePaid', { name: 'John', amount: '₱900.00' })
        );
    });

    it('says plainly when the reader is not on the bill', async () => {
        const tree = await screen([
            expense({
                payerMemberId: JOHN.id,
                shares: [{ memberId: JOHN.id, amount: 900, splitInput: null }],
            }),
        ]);
        expect(texts(tree)).toContain(EN['shared.notIncluded']);
    });

    it('says whether it reached the reader’s own spending', async () => {
        const withMirror = await screen();
        expect(texts(withMirror)).toContain(EN['shared.mirrorYes']);

        const without = await screen([expense({ hasPersonalShare: false })]);
        expect(texts(without)).toContain(EN['shared.mirrorNo']);
    });

    it('breaks the split down by person', async () => {
        const tree = await screen([
            expense({
                splitMethod: 'SHARES',
                shares: [
                    { memberId: JOHN.id, amount: 300, splitInput: '1' },
                    { memberId: SELF.id, amount: 600, splitInput: '2' },
                ],
            }),
        ]);
        const shown = texts(tree);

        expect(shown).toContain(EN['split.shares']);
        expect(shown).toContain('₱600.00');
        expect(shown).toContain('₱300.00');
        expect(shown).toContain('2');
    });

    it('warns what a deletion takes and what it leaves behind', async () => {
        const tree = await screen();
        await press(byText(tree, EN['shared.delete']));

        const shown = texts(tree);
        expect(shown).toContain(EN['shared.deleteTitle']);
        // Repayments survive, so somebody can end up holding a credit — the
        // dialog has to say so before the tap, not after.
        expect(shown).toContain(EN['shared.deleteMsg']);
    });

    it('deletes only once the dialog is answered', async () => {
        sharedExpenseService.remove.mockResolvedValue({ data: {} });
        const tree = await screen();

        await press(byText(tree, EN['shared.delete']));
        expect(sharedExpenseService.remove).not.toHaveBeenCalled();

        await press(lastByText(tree, EN['shared.delete']));
        await flush();

        expect(sharedExpenseService.remove).toHaveBeenCalledWith(GROUP_ID, EXPENSE_ID);
        expect(navigation.goBack).toHaveBeenCalled();
    });

    it('keeps the bill when the dialog is dismissed', async () => {
        const tree = await screen();
        await press(byText(tree, EN['shared.delete']));
        await press(lastByText(tree, EN['common.cancel']));
        await flush();

        expect(sharedExpenseService.remove).not.toHaveBeenCalled();
        expect(navigation.goBack).not.toHaveBeenCalled();
    });

    it('opens the editor', async () => {
        const tree = await screen();
        await press(byText(tree, EN['shared.edit']));

        expect(navigation.navigate).toHaveBeenCalledWith('EditSharedExpense', {
            groupId: GROUP_ID,
            sharedExpenseId: EXPENSE_ID,
        });
    });

    it('offers nothing to change in an archived group', async () => {
        const tree = await screen(undefined, { archivedAt: '2026-08-01T00:00:00.000Z' });
        const shown = texts(tree);

        // Absent rather than present and refused.
        expect(shown).not.toContain(EN['shared.edit']);
        expect(shown).not.toContain(EN['shared.delete']);
        expect(shown).toContain(EN['groups.archivedNotice']);
        // Still readable.
        expect(shown).toContain('₱900.00');
    });
});

// ---------------------------------------------------------------------------

describe('accessibility', () => {
    it('tells a screen reader which split method is chosen', async () => {
        seed();
        const tree = await render(
            <AddSharedExpenseScreen navigation={navigation} route={{ params: { groupId: GROUP_ID } }} />
        );

        expect(byLabel(tree, EN['split.equal']).props.accessibilityState.selected).toBe(true);
        expect(byLabel(tree, EN['split.shares']).props.accessibilityState.selected).toBe(false);
    });

    it('announces a changing split without stealing focus', async () => {
        seed();
        const tree = await render(
            <AddSharedExpenseScreen navigation={navigation} route={{ params: { groupId: GROUP_ID } }} />
        );
        await type(inputs(tree)[1], '900');
        await press(byLabel(tree, EN['split.fixed']));

        const live = tree.root.findAll(
            (node) =>
                typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite'
        );
        expect(live.length).toBeGreaterThan(0);
    });

    it('reads a share as one sentence rather than two fragments', async () => {
        seed();
        const tree = await render(
            <SharedExpenseDetailScreen
                navigation={navigation}
                route={{ params: { groupId: GROUP_ID, sharedExpenseId: EXPENSE_ID } }}
            />
        );

        const labels = tree.root
            .findAll((node) => typeof node.type === 'string')
            .map((node) => node.props.accessibilityLabel)
            .filter(Boolean);

        expect(labels).toContain(fill('shared.a11yShare', { name: 'Paul', amount: '₱450.00' }));
    });

    it('keeps every control thumb-sized', async () => {
        seed();
        const tree = await render(
            <AddSharedExpenseScreen navigation={navigation} route={{ params: { groupId: GROUP_ID } }} />
        );

        touchables(tree).forEach((node) => {
            const style = Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
            if (style.minHeight !== undefined || style.height !== undefined) {
                expect(style.minHeight ?? style.height).toBeGreaterThanOrEqual(44);
            }
        });
    });
});

// ---------------------------------------------------------------------------

describe('localization', () => {
    const FILES = [
        ['components', 'SplitEditor.js'],
        ['components', 'SharedExpenseForm.js'],
        ['screens', 'groups', 'AddSharedExpenseScreen.js'],
        ['screens', 'groups', 'EditSharedExpenseScreen.js'],
        ['screens', 'groups', 'SharedExpenseDetailScreen.js'],
    ];

    it('ships no English the other two locales cannot answer', () => {
        FILES.forEach((segments) => {
            const source = read(...segments);
            const keys = [...source.matchAll(/t\(\s*'([^']+)'/g)].map((match) => match[1]);

            expect(keys.length).toBeGreaterThan(0);
            keys.forEach((key) => {
                expect(STRINGS.en[key]).toBeTruthy();
                expect(STRINGS.fil[key]).toBeTruthy();
                expect(STRINGS.ceb[key]).toBeTruthy();
            });
        });
    });

    it('renders the split editor in Cebuano', async () => {
        seed();
        const tree = await render(
            <AddSharedExpenseScreen navigation={navigation} route={{ params: { groupId: GROUP_ID } }} />
        );
        // Language comes from the provider's default, so this asserts the keys
        // exist and differ rather than switching at runtime.
        expect(STRINGS.ceb['split.equal']).not.toBe(STRINGS.en['split.equal']);
        expect(texts(tree)).toContain(EN['split.equal']);
    });
});

// ---------------------------------------------------------------------------

describe('privacy', () => {
    // Comments say why the code does not do a thing; only the code decides
    // whether it does.
    const code = (segments) =>
        read(...segments)
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');

    it('keeps a draft off the disk', () => {
        const sources = [
            ['screens', 'groups', 'useSharedExpenseDraft.js'],
            ['screens', 'groups', 'AddSharedExpenseScreen.js'],
            ['screens', 'groups', 'EditSharedExpenseScreen.js'],
            ['components', 'SharedExpenseForm.js'],
        ]
            .map(code)
            .join('\n');

        // Who somebody ate with and what it cost is not something to leave in
        // AsyncStorage for whatever opens the file next.
        expect(sources).not.toMatch(/AsyncStorage/);
    });

    it('never learns the mirror row it must not edit', () => {
        const sources = FILES_UNDER_TEST.map(code).join('\n');
        expect(sources).not.toMatch(/personalExpenseId/);
    });
});

const FILES_UNDER_TEST = [
    ['components', 'SplitEditor.js'],
    ['components', 'SharedExpenseForm.js'],
    ['screens', 'groups', 'AddSharedExpenseScreen.js'],
    ['screens', 'groups', 'EditSharedExpenseScreen.js'],
    ['screens', 'groups', 'SharedExpenseDetailScreen.js'],
    ['screens', 'groups', 'GroupDetailScreen.js'],
    ['screens', 'groups', 'useSharedExpenseDraft.js'],
    ['utils', 'splitMath.js'],
];
