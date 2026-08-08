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
        sharedExpenseService: { list: pending() },
        groupBalanceService: { get: pending() },
        settlementService: { list: pending() },
    };
});

jest.mock('../../services/api', () => ({
    categoryService: { getAll: jest.fn(() => new Promise(() => {})) },
}));

import { groupBalanceService, settlementService } from '../../services/groups';
import { ThemeProvider } from '../../theme';
import { LanguageProvider } from '../../i18n';
import { FeedbackProvider } from '../../components/FeedbackProvider';
import { STRINGS } from '../../i18n/strings';
import { queryKeys } from '../../lib/queryKeys';
import GroupDetailScreen from '../groups/GroupDetailScreen';

const EN = STRINGS.en;
const SRC = path.join(__dirname, '..', '..');
const read = (...segments) => fs.readFileSync(path.join(SRC, ...segments), 'utf8');

const fill = (key, values) =>
    Object.entries(values).reduce(
        (text, [token, value]) => text.replace(`{${token}}`, String(value)),
        EN[key]
    );

const GROUP_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
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
    ...overrides,
});

const expense = (overrides = {}) => ({
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
    shares: [{ memberId: PAUL.id, amount: 500, splitInput: null }],
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    ...overrides,
});

// Shaped exactly as describePair() serialises it: ids sorted, balance always
// positive, direction said separately.
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

// Shaped as groupBalanceView() serialises it, netBalance included so the
// screen never has to work one out.
const balances = ({ pairs = [], netBalance = 0, currentUserMemberId = PAUL.id } = {}) => ({
    groupId: GROUP_ID,
    currentUserMemberId,
    youAreOwed: Math.max(netBalance, 0),
    youOwe: Math.max(-netBalance, 0),
    netBalance,
    members: [],
    pairs,
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

// Waits for everything already queued, timers included — react-query notifies
// its observers from a setTimeout(0), and node gives no guaranteed ordering
// between that and the setImmediate React's async act flushes on.
const flush = async () => {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
};

const seed = ({ groupOverrides, expenses = [expense()], balanceView } = {}) => {
    client.setQueryData(queryKeys.groups.detail(GROUP_ID), group(groupOverrides));
    if (expenses !== undefined) {
        client.setQueryData(queryKeys.groups.expenses(GROUP_ID), expenses);
    }
    if (balanceView !== undefined) {
        client.setQueryData(queryKeys.groups.balances(GROUP_ID), balanceView);
    }
};

const screen = () =>
    render(<GroupDetailScreen navigation={navigation} route={{ params: { groupId: GROUP_ID } }} />);

beforeEach(() => {
    navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
    client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    groupBalanceService.get.mockReset();
    groupBalanceService.get.mockImplementation(() => new Promise(() => {}));
    settlementService.list.mockReset();
    settlementService.list.mockImplementation(() => new Promise(() => {}));
});

afterEach(async () => {
    await act(async () => {
        mounted.forEach((tree) => tree.unmount());
    });
    mounted = [];
});

// ---------------------------------------------------------------------------

describe('balance summary', () => {
    it('says what the reader is owed when nothing is owed by them', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 400, JOHN)], netBalance: 400 }) });
        const shown = texts(await screen());

        expect(shown).toContain(EN['balances.owedToYou']);
        expect(shown).toContain('₱400.00');
        expect(shown).toContain(EN['balances.youOwe']);
        expect(shown).toContain('₱0.00');
    });

    it('says what the reader owes when they are owed nothing', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, ANNE, 300, PAUL)], netBalance: -300 }) });
        const shown = texts(await screen());

        expect(shown).toContain(EN['balances.youOwe']);
        expect(shown).toContain('₱300.00');
        // Never a negative figure: direction is carried by the label.
        expect(shown.join(' ')).not.toContain('-₱');
    });

    // The API nets these to one number, so both sides only survive if the
    // screen adds up the pairs the server already decided.
    it('shows both sides when the reader is owed and owes', async () => {
        seed({
            balanceView: balances({
                pairs: [pair(PAUL, JOHN, 500, JOHN), pair(PAUL, ANNE, 300, PAUL)],
                netBalance: 200,
            }),
        });
        const shown = texts(await screen());

        expect(shown).toContain('₱500.00');
        expect(shown).toContain('₱300.00');
        expect(shown).toContain(EN['balances.netOwed']);
        expect(shown).toContain('₱200.00');
    });

    it('keeps the net out of the way when it would only repeat one figure', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 400, JOHN)], netBalance: 400 }) });

        expect(texts(await screen())).not.toContain(EN['balances.net']);
    });

    it('says everything is settled rather than printing three zeroes', async () => {
        seed({ balanceView: balances({}) });
        const shown = texts(await screen());

        expect(shown).toContain(EN['balances.allSettled']);
        expect(shown).toContain(EN['balances.allSettledMsg']);
        expect(shown).not.toContain(EN['balances.owedToYou']);
        expect(shown).not.toContain(EN['balances.net']);
    });

    // The distinction the brief singled out: the reader is clear, the group
    // is not, and saying "all settled" would be a claim about other people.
    it('says only the reader is settled while other people still owe', async () => {
        seed({ balanceView: balances({ pairs: [pair(JOHN, MIKE, 100, JOHN)] }) });
        const shown = texts(await screen());

        expect(shown).toContain(EN['balances.youSettled']);
        expect(shown).not.toContain(EN['balances.allSettled']);
        // The third-party balance is still there to read.
        expect(shown).toContain(fill('balances.owesOther', { nameA: 'John', nameB: 'Mike' }));
    });

    it('explains that balances follow the first shared expense', async () => {
        seed({ expenses: [], balanceView: balances({}) });
        const shown = texts(await screen());

        expect(shown).toContain(EN['balances.none']);
        expect(shown).toContain(EN['balances.noneMsg']);
        expect(shown).not.toContain(EN['balances.allSettled']);
    });

    it('still shows the balances of an archived group, marked as history', async () => {
        seed({
            groupOverrides: { archivedAt: '2026-08-03T00:00:00.000Z' },
            balanceView: balances({ pairs: [pair(PAUL, JOHN, 400, JOHN)], netBalance: 400 }),
        });
        const shown = texts(await screen());

        expect(shown).toContain(EN['balances.archived']);
        expect(shown).toContain('₱400.00');
        expect(shown).toContain(fill('balances.owesYou', { name: 'John' }));
    });
});

// ---------------------------------------------------------------------------

describe('who owes whom', () => {
    it('says a debt owed to the reader in words', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        const shown = texts(await screen());

        expect(shown).toContain(EN['balances.whoOwesWhom']);
        expect(shown).toContain(fill('balances.owesYou', { name: 'John' }));
        expect(shown).toContain('₱100.00');
    });

    it('says a debt the reader owes in words', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, ANNE, 300, PAUL)], netBalance: -300 }) });

        expect(texts(await screen())).toContain(fill('balances.youOweName', { name: 'Anne' }));
    });

    it('names both people when the reader is on neither side', async () => {
        seed({ balanceView: balances({ pairs: [pair(JOHN, MIKE, 50, JOHN)] }) });

        expect(texts(await screen())).toContain(
            fill('balances.owesOther', { nameA: 'John', nameB: 'Mike' })
        );
    });

    it('never shows an arrow, a sign, or a raw balance figure', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });
        const joined = texts(await screen()).join(' ');

        expect(joined).not.toContain('→');
        expect(joined).not.toContain('-₱');
        expect(joined).not.toMatch(/Balance:/i);
    });

    // Ids are stored sorted, so the same two members produce the same memberA
    // whichever way the debt runs. Only `direction` distinguishes them.
    it('reads direction from the field rather than from the id order', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, PAUL)], netBalance: -100 }) });
        const shown = texts(await screen());

        expect(shown).toContain(fill('balances.youOweName', { name: 'John' }));
        expect(shown).not.toContain(fill('balances.owesYou', { name: 'John' }));
    });

    // A owes B and B owes C is two debts, not three. Nothing here may conclude
    // that A therefore owes C.
    it('invents no debt between two people who never transacted', async () => {
        seed({
            balanceView: balances({
                pairs: [pair(JOHN, MIKE, 100, JOHN), pair(MIKE, ANNE, 100, MIKE)],
            }),
        });
        const shown = texts(await screen());

        expect(shown).toContain(fill('balances.owesOther', { nameA: 'John', nameB: 'Mike' }));
        expect(shown).toContain(fill('balances.owesOther', { nameA: 'Mike', nameB: 'Anne' }));
        expect(shown).not.toContain(fill('balances.owesOther', { nameA: 'John', nameB: 'Anne' }));
    });

    it('puts the reader’s own balances above everybody else’s', async () => {
        seed({
            balanceView: balances({
                pairs: [pair(JOHN, MIKE, 900, JOHN), pair(PAUL, ANNE, 20, ANNE)],
                netBalance: 20,
            }),
        });
        const shown = texts(await screen());

        const mine = shown.indexOf(fill('balances.owesYou', { name: 'Anne' }));
        const theirs = shown.indexOf(fill('balances.owesOther', { nameA: 'John', nameB: 'Mike' }));

        expect(mine).toBeGreaterThanOrEqual(0);
        expect(mine).toBeLessThan(theirs);
    });

    it('leads with the largest of the reader’s own balances', async () => {
        seed({
            balanceView: balances({
                pairs: [pair(PAUL, ANNE, 20, ANNE), pair(PAUL, JOHN, 400, JOHN)],
                netBalance: 420,
            }),
        });
        const shown = texts(await screen());

        expect(shown.indexOf(fill('balances.owesYou', { name: 'John' }))).toBeLessThan(
            shown.indexOf(fill('balances.owesYou', { name: 'Anne' }))
        );
    });
});

// ---------------------------------------------------------------------------

describe('balance states', () => {
    it('stands in with a skeleton that invents no names or figures', async () => {
        // No expenses either, so the only peso figure that could appear is one
        // the skeleton invented.
        seed({ expenses: [], balanceView: undefined });
        const tree = await screen();
        const shown = texts(tree);

        // Announced once, drawn never: a skeleton that rendered a peso figure
        // would be read as one.
        expect(labels(tree)).toContain(EN['loading.balances']);
        expect(shown).not.toContain(EN['loading.balances']);
        expect(shown.join(' ')).not.toContain('₱');
        expect(shown).not.toContain(EN['balances.allSettled']);
        expect(shown).not.toContain(EN['balances.owedToYou']);
        expect(shown).not.toContain(EN['balances.whoOwesWhom']);
    });

    it('offers a retry for the section without taking the screen away', async () => {
        client.setQueryData(queryKeys.groups.detail(GROUP_ID), group());
        client.setQueryData(queryKeys.groups.expenses(GROUP_ID), [expense()]);
        groupBalanceService.get.mockRejectedValue(new Error('offline'));

        const tree = await screen();
        await flush();
        const shown = texts(tree);

        expect(byText(tree, EN['errors.tryAgain'])).toBeTruthy();
        // The rest of the group is still readable and still usable.
        expect(shown).toContain('Cebu');
        expect(shown).toContain(EN['groups.membersTitle']);
        expect(shown).toContain('Dinner');
        expect(byText(tree, EN['shared.add'])).toBeTruthy();
    });

    it('retries only the balances when the section retry is pressed', async () => {
        client.setQueryData(queryKeys.groups.detail(GROUP_ID), group());
        client.setQueryData(queryKeys.groups.expenses(GROUP_ID), [expense()]);
        groupBalanceService.get.mockRejectedValue(new Error('offline'));

        const tree = await screen();
        await flush();
        const before = groupBalanceService.get.mock.calls.length;

        await press(byText(tree, EN['errors.tryAgain']));
        await flush();

        expect(groupBalanceService.get.mock.calls.length).toBeGreaterThan(before);
    });

    // A failed refresh over figures already on screen belongs in a banner. The
    // figures are still the last thing the server said and still worth reading.
    it('keeps cached figures on screen when a refresh fails', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 400, JOHN)], netBalance: 400 }) });
        groupBalanceService.get.mockRejectedValue(new Error('offline'));

        const tree = await screen();
        await act(async () => {
            client.invalidateQueries({ queryKey: queryKeys.groups.balances(GROUP_ID) });
        });
        await flush();
        const shown = texts(tree);

        expect(shown).toContain('₱400.00');
        expect(shown).toContain(fill('balances.owesYou', { name: 'John' }));
        expect(shown).toContain(EN['errors.retry']);
        expect(shown).not.toContain(EN['loading.balances']);
    });
});

// ---------------------------------------------------------------------------

describe('settlement entry', () => {
    // The form exists as of 5F, so the row that says a debt is now the way to
    // settle it. Ids only — the destination resolves names and amounts from
    // the balances it fetches for itself.
    it('opens the settlement form from a pair row, carrying ids only', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 400, JOHN)], netBalance: 400 }) });
        const tree = await screen();

        const sentence = fill('balances.owesYou', { name: 'John' });
        const row = byText(tree, sentence);
        expect(row).toBeDefined();

        await act(async () => {
            row.props.onPress();
        });

        expect(navigation.navigate).toHaveBeenCalledWith('RecordSettlement', {
            groupId: GROUP_ID,
            fromMemberId: JOHN.id,
            toMemberId: PAUL.id,
        });
    });

    it('keeps the settlement route out of the balances UI until it works', () => {
        expect(read('components', 'GroupBalances.js')).not.toContain('RecordSettlement');
    });
});

// ---------------------------------------------------------------------------

describe('accessibility', () => {
    it('reads a pair as one sentence with the amount inside it', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 100, JOHN)], netBalance: 100 }) });

        expect(labels(await screen())).toContain(
            fill('balances.a11yOwesYou', { name: 'John', amount: '₱100.00' })
        );
    });

    it('reads a third-party pair as one sentence too', async () => {
        seed({ balanceView: balances({ pairs: [pair(JOHN, MIKE, 50, JOHN)] }) });

        expect(labels(await screen())).toContain(
            fill('balances.a11yOwesOther', { nameA: 'John', nameB: 'Mike', amount: '₱50.00' })
        );
    });

    it('announces each summary figure with its label', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 400, JOHN)], netBalance: 400 }) });
        const shown = labels(await screen());

        expect(shown).toContain(fill('balances.a11yOwedToYou', { amount: '₱400.00' }));
        expect(shown).toContain(fill('balances.a11yYouOwe', { amount: '₱0.00' }));
    });

    it('announces a net in the reader’s favour as money owed to them', async () => {
        seed({
            balanceView: balances({
                pairs: [pair(PAUL, JOHN, 500, JOHN), pair(PAUL, ANNE, 300, PAUL)],
                netBalance: 200,
            }),
        });

        expect(labels(await screen())).toContain(
            fill('balances.a11yNetOwed', { amount: '₱200.00' })
        );
    });

    // The net is the only figure on this screen that can arrive negative, so it
    // is the only one that could leak a sign into the UI. It has to read the
    // same way round as every other row: direction in the words, amount always
    // positive, and nothing announced that the screen does not also show.
    it('announces a net against the reader as money they owe, with no sign anywhere', async () => {
        seed({
            balanceView: balances({
                pairs: [pair(PAUL, JOHN, 300, JOHN), pair(PAUL, ANNE, 500, PAUL)],
                netBalance: -200,
            }),
        });

        const rendered = await screen();

        expect(labels(rendered)).toContain(
            fill('balances.a11yNetOwing', { amount: '₱200.00' })
        );
        expect(texts(rendered)).toContain(EN['balances.netOwing']);
        expect(texts(rendered)).toContain('₱200.00');
        expect(texts(rendered).join(' ')).not.toContain('-₱');
        expect(labels(rendered).join(' ')).not.toContain('-₱');
    });

    it('calls a net of zero square rather than showing ₱0.00 with a direction', async () => {
        seed({
            balanceView: balances({
                pairs: [pair(PAUL, JOHN, 300, JOHN), pair(PAUL, ANNE, 300, PAUL)],
                netBalance: 0,
            }),
        });

        const rendered = await screen();

        expect(texts(rendered)).toContain(EN['balances.netEven']);
        expect(labels(rendered)).toContain(EN['balances.a11yNetEven']);
    });

    it('announces an archived group as history only', async () => {
        seed({
            groupOverrides: { archivedAt: '2026-08-03T00:00:00.000Z' },
            balanceView: balances({ pairs: [pair(PAUL, JOHN, 400, JOHN)], netBalance: 400 }),
        });

        expect(labels(await screen())).toContain(EN['balances.a11yArchived']);
    });

    it('gives the balance sections headings', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 400, JOHN)], netBalance: 400 }) });
        const tree = await screen();

        const headers = tree.root
            .findAll((node) => typeof node.type === 'string')
            .filter((node) => node.props.accessibilityRole === 'header')
            .flatMap((node) => node.children)
            .filter((child) => typeof child === 'string');

        expect(headers).toContain(EN['balances.title']);
        expect(headers).toContain(EN['balances.whoOwesWhom']);
    });

    it('keeps every pair row thumb-sized', async () => {
        seed({
            balanceView: balances({
                pairs: [pair(PAUL, JOHN, 400, JOHN), pair(JOHN, MIKE, 50, JOHN)],
                netBalance: 400,
            }),
        });
        const tree = await screen();

        const rows = tree.root
            .findAll((node) => typeof node.type === 'string')
            .filter((node) => Boolean(node.props.accessibilityLabel) && node.props.accessible);

        rows.forEach((node) => {
            const style = Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
            if (style.minHeight !== undefined || style.height !== undefined) {
                expect(style.minHeight ?? style.height).toBeGreaterThanOrEqual(44);
            }
        });
    });

    // Colour is an addition to the words, never a replacement for them: the
    // sentence alone has to say which way the money goes.
    it('never leaves direction to colour alone', async () => {
        seed({
            balanceView: balances({
                pairs: [pair(PAUL, JOHN, 500, JOHN), pair(PAUL, ANNE, 300, PAUL)],
                netBalance: 200,
            }),
        });
        const shown = texts(await screen());

        expect(shown).toContain(fill('balances.owesYou', { name: 'John' }));
        expect(shown).toContain(fill('balances.youOweName', { name: 'Anne' }));
    });
});

// ---------------------------------------------------------------------------

describe('localization', () => {
    const FILES = [
        ['components', 'GroupBalances.js'],
        ['screens', 'groups', 'GroupDetailScreen.js'],
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

    it('translates every balance string into all three languages', () => {
        const keys = Object.keys(STRINGS.en).filter((key) => key.startsWith('balances.'));

        expect(keys.length).toBeGreaterThan(0);
        keys.forEach((key) => {
            expect(STRINGS.fil[key]).toBeTruthy();
            expect(STRINGS.ceb[key]).toBeTruthy();
            expect(STRINGS.fil[key]).not.toBe(STRINGS.en[key]);
            expect(STRINGS.ceb[key]).not.toBe(STRINGS.en[key]);
        });
    });

    it('hardcodes no user-facing English in the balances section', () => {
        const source = read('components', 'GroupBalances.js');
        const jsxText = [...source.matchAll(/>\s*([A-Z][A-Za-z',’ ]{4,})\s*</g)].map((m) => m[1]);

        expect(jsxText).toEqual([]);
    });
});

// ---------------------------------------------------------------------------

describe('privacy and performance', () => {
    const SOURCES = [
        ['components', 'GroupBalances.js'],
        ['utils', 'balances.js'],
    ];

    it('logs nothing about a group, a member or an amount', () => {
        SOURCES.forEach((segments) => {
            const source = read(...segments);
            expect(source).not.toMatch(/console\./);
            expect(source).not.toMatch(/addBreadcrumb|captureMessage|Sentry/);
        });
    });

    it('writes no balance to the disk', () => {
        SOURCES.forEach((segments) => {
            expect(read(...segments)).not.toMatch(/AsyncStorage/);
        });
    });

    it('asks for the balances once, however many pairs come back', async () => {
        client.setQueryData(queryKeys.groups.detail(GROUP_ID), group());
        client.setQueryData(queryKeys.groups.expenses(GROUP_ID), [expense()]);
        groupBalanceService.get.mockResolvedValue({
            data: balances({
                pairs: [
                    pair(PAUL, JOHN, 400, JOHN),
                    pair(PAUL, ANNE, 300, PAUL),
                    pair(JOHN, MIKE, 50, JOHN),
                ],
                netBalance: 100,
            }),
        });

        const tree = await screen();
        await flush();

        expect(texts(tree)).toContain(fill('balances.owesYou', { name: 'John' }));
        expect(groupBalanceService.get).toHaveBeenCalledTimes(1);
        expect(groupBalanceService.get).toHaveBeenCalledWith(GROUP_ID);
    });

    // One request for the whole payments section, however many rows it draws.
    it('fetches the settlements exactly once for the whole payments section', async () => {
        seed({ balanceView: balances({ pairs: [pair(PAUL, JOHN, 400, JOHN)], netBalance: 400 }) });
        await screen();
        await flush();

        expect(settlementService.list).toHaveBeenCalledTimes(1);
        expect(settlementService.list).toHaveBeenCalledWith(GROUP_ID);
    });

    it('keeps balances off the Home card and the groups list', () => {
        ['GroupsCard.js'].forEach((file) => {
            expect(read('components', file)).not.toContain('useGroupBalances');
        });
        expect(read('screens', 'HomeScreen.js')).not.toContain('useGroupBalances');
        expect(read('screens', 'groups', 'GroupsScreen.js')).not.toContain('useGroupBalances');
    });

    it('recomputes no balance from the expenses it already has', () => {
        const source = read('components', 'GroupBalances.js');

        expect(source).not.toContain('useGroupExpenses');
        expect(source).not.toMatch(/shares/);
    });
});
