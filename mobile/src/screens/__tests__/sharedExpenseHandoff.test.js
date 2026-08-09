import React from 'react';
import { TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));

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
import AddSharedExpenseScreen from '../groups/AddSharedExpenseScreen';
import SharedExpenseDetailScreen from '../groups/SharedExpenseDetailScreen';

const EN = STRINGS.en;

const fill = (key, values) =>
    Object.entries(values).reduce(
        (text, [token, value]) => text.replace(`{${token}}`, String(value)),
        EN[key]
    );

const GROUP_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const NEW_ID = 'bbbbbbbb-0000-4000-8000-000000000009';
const SAFE_AREA = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

const SELF = { id: 'm-self', name: 'Paul', isCurrentUser: true, archivedAt: null, contactNote: null };
const JOHN = { id: 'm-john', name: 'John', isCurrentUser: false, archivedAt: null, contactNote: null };

const CATEGORIES = [{ id: 1, name: 'Food', icon: 'utensils', color: '#0E5A54' }];

const GROUP = {
    id: GROUP_ID,
    name: 'Cebu',
    description: 'Weekend trip',
    color: '#0E5A54',
    archivedAt: null,
    memberCount: 2,
    members: [SELF, JOHN],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
};

// Exactly what the server answers a create with, and what the list carries a
// moment later — one shape, because it is one serialiser.
const CREATED = {
    id: NEW_ID,
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
};

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
const byText = (tree, label) =>
    touchables(tree).find((node) =>
        node
            .findAll((child) => typeof child.type === 'string' && child.type === 'Text')
            .flatMap((child) => child.children)
            .includes(label)
    );
const inputs = (tree) =>
    tree.root.findAll((node) => typeof node.type === 'string' && node.type === 'TextInput');

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

const flush = async () => {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
};

beforeEach(() => {
    navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
    client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    Object.values(sharedExpenseService).forEach((fn) => fn.mockReset?.());
    sharedExpenseService.list.mockImplementation(() => new Promise(() => {}));

    // The cache as the group screen left it: loaded, and with no bills in it.
    client.setQueryData(queryKeys.groups.detail(GROUP_ID), GROUP);
    client.setQueryData(queryKeys.groups.expenses(GROUP_ID), []);
    client.setQueryData(queryKeys.categories.all, CATEGORIES);
});

afterEach(async () => {
    await act(async () => {
        mounted.forEach((tree) => tree.unmount());
    });
    mounted = [];
});

// The whole of the reported bug, in the order the user meets it: open the
// group, add a bill, save it, and land on it.
const save = async () => {
    const form = await render(
        <AddSharedExpenseScreen navigation={navigation} route={{ params: { groupId: GROUP_ID } }} />
    );
    await type(inputs(form)[0], 'Dinner');
    await type(inputs(form)[1], '900');
    await press(byText(form, EN['shared.save']));
    await press(byText(form, EN['shared.reviewConfirm']));
    await flush();
    return form;
};

const landOnIt = () =>
    render(
        <SharedExpenseDetailScreen
            navigation={navigation}
            route={{ params: { groupId: GROUP_ID, sharedExpenseId: NEW_ID } }}
        />
    );

describe('landing on a bill that was just saved', () => {
    // The bug this file exists for: the save succeeded, the toast said so, and
    // the screen it handed over to announced that something had gone wrong.
    // Nothing had — it was reading a list fetched before the bill existed.
    it('shows the bill rather than an error while the list is still on the wire', async () => {
        sharedExpenseService.create.mockResolvedValue({ data: CREATED });
        // The refetch the save kicks off has not answered yet — which, on a
        // phone, is the case for every one of the few hundred milliseconds
        // between the toast and the screen the user is looking at.
        sharedExpenseService.list.mockImplementation(() => new Promise(() => {}));

        await save();

        expect(navigation.replace).toHaveBeenCalledWith('SharedExpenseDetail', {
            groupId: GROUP_ID,
            sharedExpenseId: NEW_ID,
        });

        const detail = await landOnIt();
        const shown = texts(detail);

        expect(shown).not.toContain(EN['errors.couldntLoad']);
        expect(shown).not.toContain(EN['errors.generic']);
        expect(shown).toContain(fill('shared.youPaid', { amount: '₱900.00' }));
    });

    it('puts the saved bill straight into the group list it came from', async () => {
        sharedExpenseService.create.mockResolvedValue({ data: CREATED });
        await save();

        // Not "will be there after a round trip" — there now, from the answer
        // the server already gave.
        expect(client.getQueryData(queryKeys.groups.expenses(GROUP_ID))).toEqual([CREATED]);
    });

    it('keeps the list in the order the server sends it', async () => {
        // A bill saved with an older date belongs where the refetch will put
        // it, not on top because it was written last.
        const older = { ...CREATED, id: 'older', date: '2026-07-01T00:00:00.000Z' };
        const newer = { ...CREATED, id: 'newer', date: '2026-09-01T00:00:00.000Z' };
        client.setQueryData(queryKeys.groups.expenses(GROUP_ID), [newer, older]);

        sharedExpenseService.create.mockResolvedValue({ data: CREATED });
        await save();

        expect(
            client.getQueryData(queryKeys.groups.expenses(GROUP_ID)).map((row) => row.id)
        ).toEqual([newer.id, NEW_ID, older.id]);
    });

    it('leaves an unfetched list alone rather than making it look complete', async () => {
        // With nothing cached, a one-row list would claim to be the group's
        // whole history. The fetch that is coming brings all of it.
        client.removeQueries({ queryKey: queryKeys.groups.expenses(GROUP_ID) });
        sharedExpenseService.create.mockResolvedValue({ data: CREATED });

        await save();

        expect(client.getQueryData(queryKeys.groups.expenses(GROUP_ID))).toBeUndefined();
    });

    it('still refetches, so the server has the last word', async () => {
        sharedExpenseService.create.mockResolvedValue({ data: CREATED });
        await save();

        // Seeding the cache is what the next screen reads in the meantime; it
        // is not a substitute for asking.
        expect(client.getQueryState(queryKeys.groups.expenses(GROUP_ID)).isInvalidated).toBe(
            true
        );
    });
});

describe('a bill that really is not there', () => {
    it('says it is gone rather than blaming the connection', async () => {
        // The list has been fetched, it succeeded, and the bill is not in it:
        // someone deleted it elsewhere. Nothing failed, so nothing offers to
        // try again.
        sharedExpenseService.list.mockResolvedValue({ data: [] });

        const detail = await landOnIt();
        // Only once the list has answered. Up to that point the screen is
        // right to say nothing, which is what the test above pins down.
        await flush();
        const shown = texts(detail);

        expect(shown).toContain(EN['shared.goneTitle']);
        expect(shown).toContain(EN['shared.goneMsg']);
        expect(shown).not.toContain(EN['errors.couldntLoad']);
        expect(shown).not.toContain(EN['errors.tryAgain']);
    });

    it('says nothing at all while the list is still being fetched', async () => {
        // The other side of the same coin: a bill absent from a list that has
        // not answered yet is not evidence of anything. Announcing it as
        // deleted would be as wrong as announcing it as a failure.
        sharedExpenseService.list.mockImplementation(() => new Promise(() => {}));

        const detail = await landOnIt();
        const shown = texts(detail);

        expect(shown).not.toContain(EN['shared.goneTitle']);
        expect(shown).not.toContain(EN['errors.couldntLoad']);
    });

    it('still shows a real failure as one', async () => {
        // The other half of the same rule: when the fetch genuinely fails and
        // there is nothing cached, the screen must say so.
        client.removeQueries({ queryKey: queryKeys.groups.expenses(GROUP_ID) });
        sharedExpenseService.list.mockRejectedValue(new Error('offline'));

        const detail = await landOnIt();
        await flush();
        const shown = texts(detail);

        expect(shown).toContain(EN['errors.couldntLoad']);
        expect(shown).not.toContain(EN['shared.goneTitle']);
    });
});
