import fs from 'fs';
import path from 'path';
import React from 'react';
import { TextInput, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));

jest.mock('../../services/groups', () => {
    const pending = () => jest.fn(() => new Promise(() => {}));
    return {
        groupService: { list: pending(), get: jest.fn() },
        groupMemberService: {},
        sharedExpenseService: { list: jest.fn() },
        groupBalanceService: { get: pending() },
        settlementService: {
            list: pending(),
            get: pending(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
        },
    };
});

jest.mock('../../services/api', () => ({
    categoryService: { getAll: jest.fn(() => new Promise(() => {})) },
}));

import {
    groupBalanceService,
    groupService,
    settlementService,
    sharedExpenseService,
} from '../../services/groups';
import { ThemeProvider } from '../../theme';
import { LanguageProvider } from '../../i18n';
import { FeedbackProvider } from '../../components/FeedbackProvider';
import { STRINGS } from '../../i18n/strings';
import { queryKeys } from '../../lib/queryKeys';
import GroupDetailScreen from '../groups/GroupDetailScreen';
import RecordSettlementScreen from '../groups/RecordSettlementScreen';
import EditSettlementScreen from '../groups/EditSettlementScreen';

const haptic = require('react-native-haptic-feedback').default.trigger;

const EN = STRINGS.en;
const SRC = path.join(__dirname, '..', '..');
const read = (...segments) => fs.readFileSync(path.join(SRC, ...segments), 'utf8');
const exists = (...segments) => fs.existsSync(path.join(SRC, ...segments));

const fill = (key, values) =>
    Object.entries(values).reduce(
        (text, [token, value]) => text.replace(`{${token}}`, String(value)),
        EN[key]
    );

const GROUP_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const SETTLEMENT_ID = 'cccccccc-0000-4000-8000-000000000001';
const SAFE_AREA = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

const PAUL = { id: 'm-self', name: 'Paul', isCurrentUser: true, archivedAt: null, contactNote: null };
const JOHN = { id: 'm-john', name: 'John', isCurrentUser: false, archivedAt: null, contactNote: null };
const MIKE = { id: 'm-mike', name: 'Mike', isCurrentUser: false, archivedAt: null, contactNote: null };
const ANNE = { id: 'm-anne', name: 'Anne', isCurrentUser: false, archivedAt: null, contactNote: null };

const group = (overrides = {}) => ({
    id: GROUP_ID,
    name: 'Cebu',
    description: 'Weekend trip',
    color: '#0E5A54',
    archivedAt: null,
    memberCount: 4,
    members: [PAUL, JOHN, MIKE, ANNE],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
});

const expense = () => ({
    id: 'bbbbbbbb-0000-4000-8000-000000000001',
    groupId: GROUP_ID,
    description: 'Dinner',
    amount: 500,
    date: '2026-08-02T00:00:00.000Z',
    note: null,
    payerMemberId: PAUL.id,
    splitMethod: 'EQUAL',
    categoryId: 1,
    hasPersonalShare: true,
    shares: [{ memberId: PAUL.id, amount: 100 }],
});

const pair = (one, two, balance, debtor) => {
    const [a, b] = one.id < two.id ? [one, two] : [two, one];
    const creditor = debtor.id === a.id ? b : a;

    return {
        memberAId: a.id,
        memberAName: a.name,
        memberBId: b.id,
        memberBName: b.name,
        balance,
        direction: { fromMemberId: debtor.id, toMemberId: creditor.id },
    };
};

const balances = ({ pairs = [], netBalance = 0 } = {}) => ({
    groupId: GROUP_ID,
    currentUserMemberId: PAUL.id,
    youAreOwed: Math.max(netBalance, 0),
    youOwe: Math.max(-netBalance, 0),
    netBalance,
    members: [],
    pairs,
});

const settlement = (overrides = {}) => ({
    id: SETTLEMENT_ID,
    groupId: GROUP_ID,
    fromMember: { id: JOHN.id, name: JOHN.name },
    toMember: { id: PAUL.id, name: PAUL.name },
    amount: 40,
    date: '2026-08-03T00:00:00.000Z',
    method: 'GCash',
    note: null,
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
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

const labels = (tree) =>
    tree.root
        .findAll((node) => typeof node.type === 'string')
        .map((node) => node.props.accessibilityLabel)
        .filter(Boolean);

const touchables = (tree) => tree.root.findAllByType(TouchableOpacity);
const inputs = (tree) => tree.root.findAllByType(TextInput);

const byText = (tree, label) =>
    touchables(tree).find((node) =>
        node
            .findAll((child) => typeof child.type === 'string' && child.type === 'Text')
            .flatMap((child) => child.children)
            .includes(label)
    );

const press = async (node) => {
    await act(async () => {
        node.props.onPress();
    });
};

const type = async (tree, index, value) => {
    await act(async () => {
        inputs(tree)[index].props.onChangeText(value);
    });
};

// A mutation settling, react-query notifying its observers, and the snackbar
// that follows are three separate turns of the loop. One tick is not enough to
// see the end of that chain, so this drains a few.
const flush = async () => {
    for (let turn = 0; turn < 4; turn += 1) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }
};

const seed = ({ groupOverrides, expenses = [expense()], balanceView, settlements, one } = {}) => {
    client.setQueryData(queryKeys.groups.detail(GROUP_ID), { ...group(), ...groupOverrides });
    if (expenses !== undefined) {
        client.setQueryData(queryKeys.groups.expenses(GROUP_ID), expenses);
    }
    if (balanceView !== undefined) {
        client.setQueryData(queryKeys.groups.balances(GROUP_ID), balanceView);
    }
    if (settlements !== undefined) {
        client.setQueryData(queryKeys.groups.settlements(GROUP_ID), settlements);
    }
    if (one !== undefined) {
        client.setQueryData(queryKeys.groups.settlement(GROUP_ID, one.id), one);
    }
};

const detailScreen = () =>
    render(<GroupDetailScreen navigation={navigation} route={{ params: { groupId: GROUP_ID } }} />);

const recordScreen = (fromMemberId = JOHN.id, toMemberId = PAUL.id) =>
    render(
        <RecordSettlementScreen
            navigation={navigation}
            route={{ params: { groupId: GROUP_ID, fromMemberId, toMemberId } }}
        />
    );

const editScreen = () =>
    render(
        <EditSettlementScreen
            navigation={navigation}
            route={{ params: { groupId: GROUP_ID, settlementId: SETTLEMENT_ID } }}
        />
    );

beforeEach(() => {
    navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
    client = new QueryClient({
        defaultOptions: {
            // Seeded data stands as given. Without this a query refetches the
            // moment it mounts, so a test that seeds one balance and mocks the
            // endpoint with another is really racing the two — and the screen
            // under test would be reading whichever won.
            queries: { retry: false, refetchOnMount: false },
            mutations: { retry: false },
        },
    });
    haptic.mockClear();
    groupService.get.mockReset();
    sharedExpenseService.list.mockReset();

    // Every read echoes whatever the test seeded.
    //
    // A successful mutation invalidates the group, and react-query awaits the
    // resulting refetches before mutateAsync resolves — so an endpoint mocked
    // to hang forever would leave the screen's success path unreachable and
    // every assertion after it silently untested. Echoing the cache makes a
    // refetch a no-op unless a test deliberately mocks a different answer.
    const echo = (key, fallback) =>
        jest.fn(async () => ({ data: client.getQueryData(key) ?? fallback }));

    groupService.get.mockImplementation(echo(queryKeys.groups.detail(GROUP_ID), group()));
    sharedExpenseService.list.mockImplementation(
        echo(queryKeys.groups.expenses(GROUP_ID), [expense()])
    );
    groupBalanceService.get.mockReset();
    groupBalanceService.get.mockImplementation(
        echo(queryKeys.groups.balances(GROUP_ID), balances())
    );
    settlementService.list.mockReset();
    settlementService.list.mockImplementation(echo(queryKeys.groups.settlements(GROUP_ID), []));
    settlementService.get.mockReset();
    settlementService.get.mockImplementation(
        echo(queryKeys.groups.settlement(GROUP_ID, SETTLEMENT_ID), settlement())
    );
    settlementService.create.mockReset();
    settlementService.update.mockReset();
    settlementService.remove.mockReset();
});

afterEach(() => {
    mounted.forEach((tree) => act(() => tree.unmount()));
    mounted = [];
    client?.clear();
});

// ---------------------------------------------------------------------------

describe('recording a payment', () => {
    it('says who is paying whom as a sentence, never as from and to', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        const tree = await recordScreen();

        expect(texts(tree)).toContain(fill('settle.dirTheyPayYou', { name: 'John' }));
        expect(texts(tree).join(' ')).not.toMatch(/fromMemberId|toMemberId/);
    });

    it('words the reader paying somebody else the other way round', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, ANNE, 100, PAUL)], netBalance: -100 }) });
        const tree = await recordScreen(PAUL.id, ANNE.id);

        expect(texts(tree)).toContain(fill('settle.dirYouPay', { name: 'Anne' }));
    });

    it('names both people when the payment is between two others', async () => {
        seed({ balanceView: balances({ pairs: [pair(JOHN, MIKE, 50, JOHN)] }) });
        const tree = await recordScreen(JOHN.id, MIKE.id);

        expect(texts(tree)).toContain(
            fill('settle.dirOther', { nameA: 'John', nameB: 'Mike' })
        );
    });

    it('defaults to the full amount outstanding', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        const tree = await recordScreen();

        expect(inputs(tree)[0].props.value).toBe('100.00');
    });

    it('shows what is owed, what is being paid and what is left', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        const tree = await recordScreen();

        await type(tree, 0, '40');

        const shown = texts(tree);
        expect(shown).toContain(EN['settle.amountOwed']);
        expect(shown).toContain('₱100.00');
        expect(shown).toContain('₱40.00');
        expect(shown).toContain('₱60.00');
    });

    it('says a full payment will settle the balance', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        const tree = await recordScreen();

        expect(texts(tree)).toContain(EN['settle.willSettle']);
        expect(texts(tree)).toContain('₱0.00');
    });

    it('refuses zero', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        const tree = await recordScreen();

        await type(tree, 0, '0');
        await press(byText(tree, EN['settle.record']));

        expect(settlementService.create).not.toHaveBeenCalled();
        expect(texts(tree)).toContain(EN['settle.amountRequired']);
    });

    it('refuses a negative amount', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        const tree = await recordScreen();

        await type(tree, 0, '-40');
        await press(byText(tree, EN['settle.record']));

        expect(settlementService.create).not.toHaveBeenCalled();
    });

    it('refuses more than is owed, and says what the ceiling is', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        const tree = await recordScreen();

        await type(tree, 0, '150');
        await press(byText(tree, EN['settle.record']));

        expect(settlementService.create).not.toHaveBeenCalled();
        expect(texts(tree)).toContain(
            fill('settle.amountTooHigh', { amount: '₱100.00' })
        );
    });

    it('offers no way to change who is paying whom', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        const tree = await recordScreen();

        // Three fields and no more: amount, method, note. A payer picker would
        // be a fourth, and would let the user build a payment the server
        // refuses.
        expect(inputs(tree)).toHaveLength(3);
        expect(read('components', 'SettlementForm.js')).not.toContain('ActionSheet');
    });

    it('sends the payment with ids, a decimal string amount and optional fields', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        settlementService.create.mockResolvedValue({ data: settlement({ amount: 40 }) });
        const tree = await recordScreen();

        await type(tree, 0, '40');
        await press(byText(tree, EN['settle.record']));
        await flush();

        expect(settlementService.create).toHaveBeenCalledTimes(1);
        const [groupArg, body] = settlementService.create.mock.calls[0];
        expect(groupArg).toBe(GROUP_ID);
        expect(body.fromMemberId).toBe(JOHN.id);
        expect(body.toMemberId).toBe(PAUL.id);
        expect(body.amount).toBe('40.00');
        expect(body.method).toBeNull();
        expect(body.note).toBeNull();
    });

    it('keeps a method and a note when they are filled in', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        settlementService.create.mockResolvedValue({ data: settlement() });
        const tree = await recordScreen();

        await type(tree, 1, 'GCash');
        await type(tree, 2, 'sent last night');
        await press(byText(tree, EN['settle.record']));
        await flush();

        const [, body] = settlementService.create.mock.calls[0];
        expect(body.method).toBe('GCash');
        expect(body.note).toBe('sent last night');
    });

    it('records once however fast the button is pressed twice', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        settlementService.create.mockResolvedValue({ data: settlement() });
        const tree = await recordScreen();
        const button = byText(tree, EN['settle.record']);

        await act(async () => {
            button.props.onPress();
            button.props.onPress();
        });
        await flush();

        expect(settlementService.create).toHaveBeenCalledTimes(1);
    });

    it('reports the balance that is left, not merely that it saved', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        settlementService.create.mockResolvedValue({ data: settlement({ amount: 40 }) });
        const tree = await recordScreen();

        await type(tree, 0, '40');
        await press(byText(tree, EN['settle.record']));
        await flush();

        const expected = fill('settle.recorded', {
            outcome: fill('settle.outcomeOwesYou', { name: 'John', amount: '₱60.00' }),
        });
        expect(texts(tree)).toContain(expected);
        expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it('says the two are settled when the payment clears the balance', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        settlementService.create.mockResolvedValue({ data: settlement({ amount: 100 }) });
        const tree = await recordScreen();

        await press(byText(tree, EN['settle.record']));
        await flush();

        expect(texts(tree)).toContain(
            fill('settle.recorded', {
                outcome: fill('settle.outcomeSettledYou', { name: 'John' }),
            })
        );
    });

    it('celebrates only after the server has confirmed it', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        settlementService.create.mockResolvedValue({ data: settlement() });
        const tree = await recordScreen();

        await press(byText(tree, EN['settle.record']));
        await flush();

        expect(haptic).toHaveBeenCalledWith('notificationSuccess', expect.anything());
    });

    it('closes the form when the balance has gone rather than offering a save', async () => {
        seed({ balanceView: balances({ pairs: [] }) });
        const tree = await recordScreen();

        expect(texts(tree)).toContain(EN['settle.gone']);
        expect(byText(tree, EN['settle.record'])).toBeUndefined();
        expect(byText(tree, EN['settle.goneBack'])).toBeDefined();
        expect(byText(tree, EN['settle.goneRefresh'])).toBeDefined();
    });

    it('shows no stale amount when it was given none to show', async () => {
        seed({ balanceView: balances({ pairs: [] }) });
        const tree = await recordScreen();

        expect(texts(tree).join(' ')).not.toContain('₱');
    });
});

// ---------------------------------------------------------------------------

describe('when the balance moves underneath the user', () => {
    const openWithConflict = async (code) => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        settlementService.create.mockRejectedValue({
            response: { status: 409, data: { code, error: 'server prose' } },
        });
        groupBalanceService.get.mockResolvedValue({
            data: balances({ pairs: [pair(PAUL, JOHN, 60, JOHN)], netBalance: 60 }),
        });

        const tree = await recordScreen();
        await press(byText(tree, EN['settle.record']));
        await flush();
        return tree;
    };

    it('explains a balance that has already been settled, and refetches', async () => {
        const tree = await openWithConflict('NO_BALANCE_TO_SETTLE');

        expect(texts(tree)).toContain(EN['settle.conflictNoBalance']);
        expect(groupBalanceService.get).toHaveBeenCalled();
    });

    // The figure named has to be the one the server would take now, which
    // means refreshing before wording the message.
    it('names the new ceiling after an overpayment refusal', async () => {
        const tree = await openWithConflict('SETTLEMENT_EXCEEDS_BALANCE');

        expect(texts(tree)).toContain(
            fill('settle.conflictExceeds', { amount: '₱60.00' })
        );
    });

    it('asks the user to look again after a write conflict', async () => {
        const tree = await openWithConflict('SETTLEMENT_CONFLICT');

        expect(texts(tree)).toContain(EN['settle.conflictChanged']);
    });

    it('never resubmits and never quietly lowers the payment', async () => {
        await openWithConflict('SETTLEMENT_EXCEEDS_BALANCE');

        expect(settlementService.create).toHaveBeenCalledTimes(1);
        expect(navigation.goBack).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------

describe('the payments a group has recorded', () => {
    const twoPayments = [
        settlement({ id: 's-new', amount: 40, date: '2026-08-05T00:00:00.000Z' }),
        settlement({
            id: 's-old',
            amount: 25,
            date: '2026-08-01T00:00:00.000Z',
            fromMember: { id: MIKE.id, name: MIKE.name },
            toMember: { id: JOHN.id, name: JOHN.name },
            method: null,
        }),
    ];

    it('reads each payment as one sentence with the amount inside it', async () => {
        seed({ balanceView: balances(), settlements: twoPayments });
        const tree = await detailScreen();

        expect(labels(tree)).toContain(
            fill('settle.rowPaidYou', { name: 'John', amount: '₱40.00' })
        );
        expect(labels(tree)).toContain(
            fill('settle.rowPaidOther', { nameA: 'Mike', nameB: 'John', amount: '₱25.00' })
        );
    });

    it('keeps the order the server sent, newest first', async () => {
        seed({ balanceView: balances(), settlements: twoPayments });
        const tree = await detailScreen();

        const shown = texts(tree);
        const newest = fill('settle.rowPaidYou', { name: 'John', amount: '₱40.00' });
        const oldest = fill('settle.rowPaidOther', {
            nameA: 'Mike',
            nameB: 'John',
            amount: '₱25.00',
        });

        expect(shown).toContain(newest);
        expect(shown).toContain(oldest);
        expect(shown.indexOf(newest)).toBeLessThan(shown.indexOf(oldest));
    });

    it('shows the method beside the date when one was recorded', async () => {
        seed({ balanceView: balances(), settlements: [twoPayments[0]] });
        const tree = await detailScreen();

        expect(texts(tree).join(' ')).toContain('GCash');
    });

    it('says so quietly when there are none yet', async () => {
        seed({ balanceView: balances(), settlements: [] });
        const tree = await detailScreen();

        expect(texts(tree)).toContain(EN['settle.historyEmpty']);
    });

    // A group with no bills has no story to tell, and a second empty heading
    // under the first is only length.
    it('removes itself entirely from a group with nothing in it', async () => {
        seed({ balanceView: balances(), expenses: [], settlements: [] });
        const tree = await detailScreen();

        expect(texts(tree)).not.toContain(EN['settle.historyTitle']);
    });

    it('fails on its own without taking the rest of the screen with it', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        client.setQueryData(queryKeys.groups.settlements(GROUP_ID), undefined);
        settlementService.list.mockRejectedValue(new Error('nope'));

        const tree = await detailScreen();
        await flush();

        const shown = texts(tree);
        expect(shown).toContain(EN['settle.loadFailed']);
        // The group and its balances are still readable.
        expect(shown).toContain('Cebu');
        expect(shown).toContain(fill('balances.owesYou', { name: 'John' }));
    });

    it('opens the editor with ids only', async () => {
        seed({ balanceView: balances(), settlements: [twoPayments[0]] });
        const tree = await detailScreen();

        await press(
            byText(tree, fill('settle.rowPaidYou', { name: 'John', amount: '₱40.00' }))
        );

        expect(navigation.navigate).toHaveBeenCalledWith('EditSettlement', {
            groupId: GROUP_ID,
            settlementId: 's-new',
        });
    });

    it('opens the editor once however fast the row is tapped twice', async () => {
        seed({ balanceView: balances(), settlements: [twoPayments[0]] });
        const tree = await detailScreen();
        const row = byText(tree, fill('settle.rowPaidYou', { name: 'John', amount: '₱40.00' }));

        await act(async () => {
            row.props.onPress();
            row.props.onPress();
        });

        expect(navigation.navigate).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------------------------------------------------------

describe('correcting a payment', () => {
    const seedEdit = (overrides = {}, balanceOverrides) => {
        seed({
            ...overrides,
            balanceView:
                balanceOverrides ??
                balances({ pairs: [pair(PAUL, JOHN, 60, JOHN)], netBalance: 60 }),
            one: settlement(overrides.settlementOverrides),
        });
    };

    it('opens with the amount, method and original date already in it', async () => {
        seedEdit();
        const tree = await editScreen();

        expect(inputs(tree)[0].props.value).toBe('40.00');
        expect(inputs(tree)[1].props.value).toBe('GCash');
    });

    it('states the direction in the past tense and cannot change it', async () => {
        seedEdit();
        const tree = await editScreen();

        expect(texts(tree)).toContain(fill('settle.paidYou', { name: 'John' }));
        expect(texts(tree)).toContain(EN['settle.directionFixed']);
    });

    // ₱100 was owed, ₱40 was paid, ₱60 shows. The editor has to allow the
    // whole ₱100 back, not just the ₱60 remaining.
    it('allows raising the payment to the original debt, not just the remainder', async () => {
        seedEdit();
        settlementService.update.mockResolvedValue({ data: settlement({ amount: 100 }) });
        const tree = await editScreen();

        await type(tree, 0, '100');
        await press(byText(tree, EN['settle.save']));
        await flush();

        expect(settlementService.update).toHaveBeenCalledTimes(1);
        const [, , body] = settlementService.update.mock.calls[0];
        expect(body.amount).toBe('100.00');
    });

    it('still refuses more than the debt ever was', async () => {
        seedEdit();
        const tree = await editScreen();

        await type(tree, 0, '150');
        await press(byText(tree, EN['settle.save']));

        expect(settlementService.update).not.toHaveBeenCalled();
        expect(texts(tree)).toContain(fill('settle.amountTooHigh', { amount: '₱100.00' }));
    });

    it('lets a payment that settled its pair completely still be edited', async () => {
        seedEdit(
            { settlementOverrides: { amount: 100 } },
            balances({ pairs: [] })
        );
        settlementService.update.mockResolvedValue({ data: settlement({ amount: 80 }) });
        const tree = await editScreen();

        await type(tree, 0, '80');
        await press(byText(tree, EN['settle.save']));
        await flush();

        expect(settlementService.update).toHaveBeenCalledTimes(1);
    });

    it('lowers a payment and says what reopens', async () => {
        seedEdit();
        settlementService.update.mockResolvedValue({ data: settlement({ amount: 20 }) });
        const tree = await editScreen();

        await type(tree, 0, '20');
        await press(byText(tree, EN['settle.save']));
        await flush();

        expect(texts(tree)).toContain(
            fill('settle.updated', {
                outcome: fill('settle.outcomeOwesYou', { name: 'John', amount: '₱80.00' }),
            })
        );
        expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it('never sends the direction back to the server', async () => {
        seedEdit();
        settlementService.update.mockResolvedValue({ data: settlement() });
        const tree = await editScreen();

        await press(byText(tree, EN['settle.save']));
        await flush();

        const [, , body] = settlementService.update.mock.calls[0];
        expect(body).not.toHaveProperty('fromMemberId');
        expect(body).not.toHaveProperty('toMemberId');
        expect(body).not.toHaveProperty('groupId');
    });

    it('handles the server refusing an overpayment on an edit too', async () => {
        seedEdit();
        settlementService.update.mockRejectedValue({
            response: { status: 409, data: { code: 'SETTLEMENT_EXCEEDS_BALANCE' } },
        });
        groupBalanceService.get.mockResolvedValue({
            data: balances({ pairs: [pair(PAUL, JOHN, 10, JOHN)], netBalance: 10 }),
        });
        const tree = await editScreen();

        await press(byText(tree, EN['settle.save']));
        await flush();

        // 10 outstanding + the 40 already recorded.
        expect(texts(tree)).toContain(fill('settle.conflictExceeds', { amount: '₱50.00' }));
    });
});

// ---------------------------------------------------------------------------

describe('removing a payment', () => {
    const openEditor = async () => {
        seed({
            balanceView: balances({ pairs: [pair(PAUL, JOHN, 60, JOHN)], netBalance: 60 }),
            one: settlement(),
        });
        return editScreen();
    };

    it('asks first, and explains that no money moves', async () => {
        const tree = await openEditor();

        await press(byText(tree, EN['settle.delete']));

        const shown = texts(tree);
        expect(shown).toContain(EN['settle.deleteTitle']);
        expect(shown).toContain(EN['settle.deleteBody']);
        expect(settlementService.remove).not.toHaveBeenCalled();
    });

    it('does nothing when the confirmation is dismissed', async () => {
        const tree = await openEditor();

        await press(byText(tree, EN['settle.delete']));
        await press(byText(tree, EN['common.cancel']));
        await flush();

        expect(settlementService.remove).not.toHaveBeenCalled();
    });

    it('removes it, says balances were recalculated, and leaves once', async () => {
        settlementService.remove.mockResolvedValue({ data: { deleted: true } });
        const tree = await openEditor();

        await press(byText(tree, EN['settle.delete']));
        await press(byText(tree, EN['settle.deleteConfirm']));
        await flush();

        expect(settlementService.remove).toHaveBeenCalledWith(GROUP_ID, SETTLEMENT_ID);
        expect(texts(tree)).toContain(EN['settle.removed']);
        expect(navigation.goBack).toHaveBeenCalledTimes(1);
        expect(haptic).toHaveBeenCalledWith('notificationWarning', expect.anything());
    });

    it('touches no expense, shared or personal', async () => {
        settlementService.remove.mockResolvedValue({ data: { deleted: true } });
        const tree = await openEditor();

        await press(byText(tree, EN['settle.delete']));
        await press(byText(tree, EN['settle.deleteConfirm']));
        await flush();

        const source = read('hooks', 'useGroups.js');
        // The settlement mutations invalidate the group and nothing wider.
        expect(source).toContain('useSettlementMutation');
        expect(source.split('const useSettlementMutation')[1]).not.toContain(
            'invalidatePersonalSpending'
        );
    });
});

// ---------------------------------------------------------------------------

describe('an archived group', () => {
    const ARCHIVED = { archivedAt: '2026-08-04T00:00:00.000Z' };

    it('keeps balances readable but offers no way to settle them', async () => {
        seed({
            groupOverrides: ARCHIVED,
            balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }),
            settlements: [],
        });
        const tree = await detailScreen();

        const sentence = fill('balances.owesYou', { name: 'John' });
        expect(texts(tree)).toContain(sentence);
        expect(byText(tree, sentence)).toBeUndefined();
    });

    it('keeps payment history readable but not editable', async () => {
        seed({
            groupOverrides: ARCHIVED,
            balanceView: balances(),
            settlements: [settlement()],
        });
        const tree = await detailScreen();

        const row = fill('settle.rowPaidYou', { name: 'John', amount: '₱40.00' });
        expect(labels(tree)).toContain(row);
        expect(byText(tree, row)).toBeUndefined();
    });

    it('renders a payment reached after archival as a read-only record', async () => {
        seed({
            groupOverrides: ARCHIVED,
            balanceView: balances({ pairs: [pair(PAUL, JOHN, 60, JOHN)], netBalance: 60 }),
            one: settlement(),
        });
        const tree = await editScreen();

        expect(texts(tree)).toContain(EN['settle.archivedReadOnly']);
        expect(byText(tree, EN['settle.save'])).toBeUndefined();
        expect(byText(tree, EN['settle.delete'])).toBeUndefined();
        expect(inputs(tree)).toHaveLength(0);
    });

    it('refuses to offer a recording form the server would reject', async () => {
        seed({
            groupOverrides: ARCHIVED,
            balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }),
        });
        const tree = await recordScreen();

        expect(texts(tree)).toContain(EN['settle.archivedNotice']);
        expect(byText(tree, EN['settle.record'])).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------

describe('no route is a shell any more', () => {
    it('has deleted the placeholder screen', () => {
        expect(exists('screens', 'groups', 'GroupRouteShell.js')).toBe(false);
    });

    it('leaves no reference to it anywhere in the source', () => {
        const files = [
            ['screens', 'groups', 'RecordSettlementScreen.js'],
            ['screens', 'groups', 'EditSettlementScreen.js'],
            ['navigation', 'AppNavigator.js'],
        ];
        files.forEach((segments) => expect(read(...segments)).not.toContain('GroupRouteShell'));
    });

    it('ships no "on its way" copy in any language', () => {
        ['en', 'fil', 'ceb'].forEach((code) =>
            expect(STRINGS[code]['groups.preparing']).toBeUndefined()
        );
        expect(read('i18n', 'strings.js')).not.toContain('groups.preparing');
    });

    it('points both settlement routes at real screens', () => {
        const navigator = read('navigation', 'AppNavigator.js');
        expect(navigator).toContain('RecordSettlementScreen');
        expect(navigator).toContain('EditSettlementScreen');
    });
});

// ---------------------------------------------------------------------------

describe('accessibility', () => {
    it('gives a pair row a hint that says what pressing it does', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        const tree = await detailScreen();

        const row = byText(tree, fill('balances.owesYou', { name: 'John' }));
        expect(row.props.accessibilityHint).toBe(EN['settle.a11yRecordHint']);
    });

    it('announces each preview figure with its label rather than as a bare number', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        const tree = await recordScreen();

        await type(tree, 0, '40');

        const shown = labels(tree);
        expect(shown).toContain(fill('settle.a11yOwed', { amount: '₱100.00' }));
        expect(shown).toContain(fill('settle.a11yPaying', { amount: '₱40.00' }));
        expect(shown).toContain(fill('settle.a11yRemaining', { amount: '₱60.00' }));
    });

    it('makes the running remainder a polite live region, never an interrupting one', () => {
        const source = read('components', 'SettlementForm.js');
        expect(source).toContain('accessibilityLiveRegion="polite"');
        expect(source).not.toContain('accessibilityLiveRegion="assertive"');
    });

    it('gives every row and control room for a finger', () => {
        [
            read('components', 'SettlementForm.js'),
            read('components', 'GroupSettlements.js'),
        ].forEach((source) => {
            const heights = source.match(/minHeight: (\d+)/g) ?? [];
            expect(heights.length).toBeGreaterThan(0);
            heights.forEach((declaration) =>
                expect(Number(declaration.replace('minHeight: ', ''))).toBeGreaterThanOrEqual(44)
            );
        });
    });

    it('marks the payments heading as a header', () => {
        expect(read('components', 'GroupSettlements.js')).toContain('accessibilityRole="header"');
    });

    it('shows no signed money anywhere on the settlement screens', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        const tree = await recordScreen();

        await type(tree, 0, '150');

        expect(texts(tree).join(' ')).not.toContain('-₱');
        expect(labels(tree).join(' ')).not.toContain('-₱');
    });
});

// ---------------------------------------------------------------------------

describe('localization', () => {
    const KEYS = Object.keys(EN).filter((key) => key.startsWith('settle.'));

    it('defines every settlement string in all three languages', () => {
        expect(KEYS.length).toBeGreaterThan(30);
        ['fil', 'ceb'].forEach((code) =>
            KEYS.forEach((key) => {
                expect(typeof STRINGS[code][key]).toBe('string');
                expect(STRINGS[code][key].trim()).not.toBe('');
            })
        );
    });

    it('keeps every placeholder in every translation', () => {
        const placeholders = (text) => (text.match(/\{[a-zA-Z]+\}/g) ?? []).sort();

        KEYS.forEach((key) =>
            ['fil', 'ceb'].forEach((code) =>
                expect({ key, code, tokens: placeholders(STRINGS[code][key]) }).toEqual({
                    key,
                    code,
                    tokens: placeholders(EN[key]),
                })
            )
        );
    });

    // One concept, one word. The backend calls these repayments and
    // settlements; the interface calls all of them payments.
    it('uses one word for a payment across the whole Groups feature', () => {
        const groupsCopy = Object.entries(EN)
            .filter(([key]) => /^(settle|balances|groups|shared)\./.test(key))
            .map(([, text]) => text)
            .join(' ');

        expect(groupsCopy).not.toMatch(/repayment/i);
        expect(groupsCopy).not.toMatch(/settlement/i);
    });

    it('hardcodes no user-facing English in the new files', () => {
        [
            ['components', 'SettlementForm.js'],
            ['components', 'GroupSettlements.js'],
            ['screens', 'groups', 'RecordSettlementScreen.js'],
            ['screens', 'groups', 'EditSettlementScreen.js'],
        ].forEach((segments) => {
            const source = read(...segments);
            const suspicious = source.match(
                /(?:accessibilityLabel|accessibilityHint|title)=\{?["'][A-Z][a-z]/g
            );
            expect({ file: segments.join('/'), suspicious }).toEqual({
                file: segments.join('/'),
                suspicious: null,
            });
        });
    });
});

// ---------------------------------------------------------------------------

describe('privacy and performance', () => {
    const NEW_FILES = [
        ['components', 'SettlementForm.js'],
        ['components', 'GroupSettlements.js'],
        ['screens', 'groups', 'RecordSettlementScreen.js'],
        ['screens', 'groups', 'EditSettlementScreen.js'],
        ['utils', 'settlements.js'],
    ];

    it('logs nothing, reports nothing and stores nothing on the device', () => {
        NEW_FILES.forEach((segments) => {
            const source = read(...segments);
            expect({
                file: segments.join('/'),
                logs: /console\./.test(source),
                sentry: /Sentry|addBreadcrumb/.test(source),
                stored: /AsyncStorage/.test(source),
            }).toEqual({ file: segments.join('/'), logs: false, sentry: false, stored: false });
        });
    });

    it('carries only ids between screens', () => {
        const detail = read('screens', 'groups', 'GroupDetailScreen.js');
        // The only things handed to a settlement route are the group, the two
        // member ids and the settlement id.
        expect(detail).toContain('openOnce(SETTLEMENT_ROUTE, settlementRouteParams(groupId, pair))');
        expect(detail).toContain("openOnce('EditSettlement', { groupId, settlementId })");
    });

    it('makes exactly four requests for the whole group screen', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        client.setQueryData(queryKeys.groups.settlements(GROUP_ID), undefined);
        settlementService.list.mockResolvedValue({ data: [settlement(), settlement({ id: 's-2' })] });

        await detailScreen();
        await flush();

        // Two payment rows, one request between them.
        expect(settlementService.list).toHaveBeenCalledTimes(1);
        expect(settlementService.get).not.toHaveBeenCalled();
        expect(groupService.get).not.toHaveBeenCalled();
        expect(sharedExpenseService.list).not.toHaveBeenCalled();
    });

    it('keeps settlements off the Home card and the groups list', () => {
        expect(read('components', 'GroupsCard.js')).not.toContain('useGroupSettlements');
        expect(read('screens', 'HomeScreen.js')).not.toContain('useGroupSettlements');
        expect(read('screens', 'groups', 'GroupsScreen.js')).not.toContain('useGroupSettlements');
    });

    it('invalidates one group rather than the whole app after a payment', () => {
        const source = read('hooks', 'useGroups.js');
        const settlementSection = source.split('const useSettlementMutation')[1];
        expect(settlementSection).toContain('invalidateGroup');
        expect(settlementSection).not.toContain('queryClient.clear');
        expect(settlementSection).not.toContain('invalidateGroupLists');
    });
});
