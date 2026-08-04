import fs from 'fs';
import path from 'path';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));

// The card's own query would otherwise reach axios: the loading case
// deliberately seeds no data, and a test has no business opening a socket to
// find that out. Never resolves, so "loading" stays loading.
jest.mock('../../services/groups', () => ({
    groupService: { list: jest.fn(() => new Promise(() => {})) },
    groupMemberService: {},
    sharedExpenseService: {},
    groupBalanceService: { get: jest.fn(() => new Promise(() => {})) },
    settlementService: {},
}));

import { ThemeProvider } from '../../theme';
import { LanguageProvider } from '../../i18n';
import { STRINGS } from '../../i18n/strings';
import GroupsCard from '../../components/GroupsCard';
import { queryKeys } from '../../lib/queryKeys';

const EN = STRINGS.en;
const SRC = path.join(__dirname, '..', '..');
const read = (...segments) => fs.readFileSync(path.join(SRC, ...segments), 'utf8');

const SAFE_AREA = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

let mounted = [];

const render = async (element, client) => {
    let tree;
    await act(async () => {
        tree = renderer.create(
            <QueryClientProvider client={client}>
                <ThemeProvider>
                    <LanguageProvider>
                        <SafeAreaProvider initialMetrics={SAFE_AREA}>{element}</SafeAreaProvider>
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

afterEach(async () => {
    await act(async () => {
        mounted.forEach((tree) => tree.unmount());
    });
    mounted = [];
});

// ---------------------------------------------------------------------------

describe('navigation', () => {
    const navigator = read('navigation', 'AppNavigator.js');

    const ROUTES = [
        'Groups',
        'CreateGroup',
        'EditGroup',
        'GroupDetail',
        'ManageGroupMembers',
        'AddSharedExpense',
        'EditSharedExpense',
        'SharedExpenseDetail',
        'RecordSettlement',
        'EditSettlement',
    ];

    it('registers all ten group routes', () => {
        ROUTES.forEach((route) =>
            expect({ route, registered: navigator.includes(`name="${route}"`) }).toEqual({
                route,
                registered: true,
            })
        );
    });

    it('registers them inside the authenticated branch', () => {
        // Everything below is somebody's finances. A group route reachable from
        // the signed-out stack would be a route reachable with no account.
        const signedOut = navigator.indexOf('name="Login"');
        ROUTES.forEach((route) =>
            expect({ route, beforeLogin: navigator.indexOf(`name="${route}"`) < signedOut }).toEqual(
                { route, beforeLogin: true }
            )
        );
    });

    it('resolves every route to a real screen module', () => {
        ROUTES.forEach((route) => {
            // Tolerates the wrapped JSX the longer route names are written in.
            const component = new RegExp(
                `name="${route}"[\\s\\S]{0,80}?component=\\{(\\w+)\\}`
            ).exec(navigator);
            expect({ route, wired: Boolean(component) }).toEqual({ route, wired: true });
            expect(navigator).toMatch(
                new RegExp(`import ${component[1]} from '\\.\\./screens/groups/`)
            );
        });
    });

    it('keeps the tab bar at five', () => {
        // A sixth tab would crush the labels, and the middle slot is an add
        // button rather than a destination.
        expect(navigator.match(/<Tab\.Screen/g)).toHaveLength(5);
    });

    it('carries only ids in route params', () => {
        // Names, notes and amounts are loaded on the screen from the id, so
        // nothing carrying somebody's finances lands in a breadcrumb.
        const params = navigator.match(/Route params[\s\S]*?Ids only/);
        expect(params).not.toBeNull();
        expect(params[0]).not.toMatch(/name|amount|note|description/i);
    });
});

describe('entry points', () => {
    it('reach Groups from Home, Settings and Search', () => {
        expect(read('screens', 'HomeScreen.js')).toMatch(/navigation\.navigate\('Groups'\)/);
        expect(read('screens', 'SettingsScreen.js')).toMatch(/navigation\.navigate\('Groups'\)/);
        expect(read('screens', 'GlobalSearchScreen.js')).toMatch(/groups: \['Groups'\]/);
    });

    it('add a search action with keywords in all three languages', () => {
        const search = read('screens', 'GlobalSearchScreen.js');
        expect(search).toMatch(/key: 'groups'/);
        expect(search).toMatch(/labelKey: 'search\.actionGroups'/);

        ['en', 'fil', 'ceb'].forEach((code) => {
            const keywords = STRINGS[code]['search.keywordsGroups'];
            expect({ code, defined: typeof keywords === 'string' && keywords.length > 0 }).toEqual({
                code,
                defined: true,
            });
            // Natural words somebody would actually type, not one token.
            expect(keywords.split(' ').length).toBeGreaterThan(3);
        });
    });

    it('route through the shared guard rather than repeating it', () => {
        // Three screens open an expense. All three ask the same function, so
        // one of them cannot quietly keep opening the ordinary editor.
        ['ExpensesScreen.js', 'HomeScreen.js', 'GlobalSearchScreen.js'].forEach((screen) => {
            const source = read('screens', screen);
            expect({ screen, uses: source.includes('expenseRoute(') }).toEqual({
                screen,
                uses: true,
            });
            expect({ screen, hardcoded: /navigate\('EditExpense'/.test(source) }).toEqual({
                screen,
                hardcoded: false,
            });
        });
    });
});

describe('mirrored rows in the expenses list', () => {
    const source = read('screens', 'ExpensesScreen.js');

    it('withhold every way the list edits a row', () => {
        // Swipe, long press and the rotor action are all conditional on the
        // row not being a mirror, and the swipe wrapper is skipped entirely —
        // a delete revealed and then refused is worse than one never offered.
        expect(source).toMatch(/const shared = isSharedMirror\(item\)/);
        expect(source).toMatch(/onLongPress=\{shared \? undefined :/);
        expect(source).toMatch(/accessibilityActions=\{shared \? undefined : ROW_ACTIONS\}/);
        expect(source).toMatch(/if \(shared\) \{\s*return row;/);
    });

    it('say so in a sentence, not only with a badge', () => {
        expect(source).toMatch(/accessibilityHint=\{shared \? t\('expenses\.sharedA11y'\)/);
        expect(EN['expenses.sharedA11y']).toMatch(/shared expense/i);
        expect(EN['expenses.sharedA11y']).toMatch(/group/i);
    });

    it('badge with a glyph and a word, never colour alone', () => {
        expect(source).toMatch(/sharedBadgeText/);
        expect(source).toMatch(/t\('expenses\.sharedBadge'\)/);
    });
});

describe('the Home groups card', () => {
    const seeded = (groups) => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        if (groups !== undefined) {
            client.setQueryData(queryKeys.groups.list(false), groups);
        }
        return client;
    };

    const card = (tree) => tree.root.findAllByType(TouchableOpacity)[0];

    it('shows a count once groups are loaded', async () => {
        const tree = await render(<GroupsCard onPress={jest.fn()} />, seeded([{ id: 'a' }, { id: 'b' }]));
        expect(texts(tree)).toContain(EN['groups.cardMany'].replace('{count}', '2'));
        expect(texts(tree)).toContain(EN['groups.cardHelper']);
    });

    it('says one group in the singular', async () => {
        const tree = await render(<GroupsCard onPress={jest.fn()} />, seeded([{ id: 'a' }]));
        expect(texts(tree)).toContain(EN['groups.cardOne']);
    });

    it('teaches rather than counts when there are none', async () => {
        const tree = await render(<GroupsCard onPress={jest.fn()} />, seeded([]));
        expect(texts(tree)).toContain(EN['groups.cardEmpty']);
    });

    it('opens create when empty and the list otherwise', async () => {
        const onPress = jest.fn();
        const onCreate = jest.fn();

        const empty = await render(<GroupsCard onPress={onPress} onCreate={onCreate} />, seeded([]));
        await act(async () => card(empty).props.onPress());
        expect(onCreate).toHaveBeenCalledTimes(1);
        expect(onPress).not.toHaveBeenCalled();

        const full = await render(
            <GroupsCard onPress={onPress} onCreate={onCreate} />,
            seeded([{ id: 'a' }])
        );
        await act(async () => card(full).props.onPress());
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('invents no balance, ever', async () => {
        const tree = await render(
            <GroupsCard onPress={jest.fn()} />,
            seeded([{ id: 'a', name: 'Cebu' }])
        );
        const shown = texts(tree).join(' ');

        // A zero balance and a settled balance look identical, so the card
        // says neither. It says where the balances are.
        expect(shown).not.toMatch(/₱|owed|owe\b/i);
        expect(shown).toContain(EN['groups.cardHelper']);
    });

    it('asks for the group list once and never a balance', async () => {
        const client = seeded(undefined);
        const spy = jest.spyOn(client, 'getQueryData');
        await render(<GroupsCard onPress={jest.fn()} />, client);

        const keys = client.getQueryCache().getAll().map((entry) => entry.queryKey);
        expect(keys).toContainEqual(queryKeys.groups.list(false));
        // No per-group ledger fetch from the dashboard.
        expect(keys.some((key) => key.includes('balances'))).toBe(false);
        spy.mockRestore();
    });

    it('is one control with one announcement', async () => {
        const tree = await render(<GroupsCard onPress={jest.fn()} />, seeded([{ id: 'a' }]));
        const control = card(tree);

        expect(control.props.accessible).toBe(true);
        expect(control.props.accessibilityRole).toBe('button');
        expect(control.props.accessibilityLabel).toContain(EN['groups.cardOne']);
        expect(control.props.accessibilityHint).toBe(EN['groups.cardOpen']);
    });

    it('keeps a target worth aiming at', async () => {
        const tree = await render(<GroupsCard onPress={jest.fn()} />, seeded([{ id: 'a' }]));
        const style = card(tree).props.style;
        const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
        expect(flat.minHeight).toBeGreaterThanOrEqual(44);
    });

    it('renders no invented names or figures while loading', async () => {
        const tree = await render(<GroupsCard onPress={jest.fn()} />, seeded(undefined));
        const shown = texts(tree).join(' ');
        expect(shown).not.toMatch(/₱|\d/);
    });
});

describe('localization', () => {
    const NEW_KEYS = Object.keys(EN).filter(
        (key) =>
            key.startsWith('groups.') ||
            key === 'search.actionGroups' ||
            key === 'search.keywordsGroups' ||
            key === 'settings.groups' ||
            key === 'settings.groupsMeta' ||
            key.startsWith('expenses.shared') ||
            key === 'server.expenseIsShared' ||
            key === 'server.groupNotFound' ||
            key === 'server.groupArchived'
    );

    it('adds every new key to all three languages', () => {
        expect(NEW_KEYS.length).toBeGreaterThan(20);
        NEW_KEYS.forEach((key) => {
            ['fil', 'ceb'].forEach((code) => {
                const value = STRINGS[code][key];
                expect({ key, code, ok: typeof value === 'string' && value.trim() !== '' }).toEqual({
                    key,
                    code,
                    ok: true,
                });
            });
        });
    });

    it('keeps placeholders identical across languages', () => {
        const placeholders = (text) => (String(text).match(/\{[a-z]+\}/gi) || []).sort();

        NEW_KEYS.forEach((key) => {
            const expected = placeholders(EN[key]);
            ['fil', 'ceb'].forEach((code) =>
                expect({ key, code, found: placeholders(STRINGS[code][key]) }).toEqual({
                    key,
                    code,
                    found: expected,
                })
            );
        });
    });

    it('translates the count placeholder rather than hardcoding a number', () => {
        ['en', 'fil', 'ceb'].forEach((code) =>
            expect(STRINGS[code]['groups.cardMany']).toContain('{count}')
        );
    });

    it('hardcodes no user-facing English in the new files', () => {
        const files = [
            ['components', 'GroupsCard.js'],
            ['screens', 'groups', 'GroupRouteShell.js'],
            ['screens', 'groups', 'GroupsScreen.js'],
            ['services', 'groups.js'],
            ['hooks', 'useGroups.js'],
            ['utils', 'sharedExpense.js'],
        ];

        files.forEach((segments) => {
            const source = read(...segments);
            // Any string handed to a Text or an accessibility prop must come
            // from a translation key.
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

describe('privacy', () => {
    const NEW_FILES = [
        ['services', 'groups.js'],
        ['hooks', 'useGroups.js'],
        ['utils', 'sharedExpense.js'],
        ['components', 'GroupsCard.js'],
        ['screens', 'groups', 'GroupRouteShell.js'],
    ];

    it('logs nothing from the new data layer', () => {
        NEW_FILES.forEach((segments) => {
            const source = read(...segments);
            expect({ file: segments.join('/'), logs: /console\./.test(source) }).toEqual({
                file: segments.join('/'),
                logs: false,
            });
        });
    });

    it('persists no group data on the device', () => {
        // Group names, member names and amounts are somebody's finances and
        // other people's names. None of it belongs in AsyncStorage.
        NEW_FILES.forEach((segments) => {
            const source = read(...segments);
            expect({ file: segments.join('/'), stores: /AsyncStorage/.test(source) }).toEqual({
                file: segments.join('/'),
                stores: false,
            });
        });
    });

    it('adds no Sentry breadcrumbs', () => {
        NEW_FILES.forEach((segments) => {
            const source = read(...segments);
            expect({ file: segments.join('/'), sentry: /Sentry|addBreadcrumb/.test(source) }).toEqual(
                { file: segments.join('/'), sentry: false }
            );
        });
    });
});

describe('server error codes', () => {
    it('prefer a stable code over matching English prose', () => {
        const { SERVER_CODE_KEYS } = require('../../utils/serverErrors');
        expect(SERVER_CODE_KEYS.EXPENSE_IS_SHARED).toBe('server.expenseIsShared');

        ['en', 'fil', 'ceb'].forEach((code) =>
            Object.values(SERVER_CODE_KEYS).forEach((key) =>
                expect(typeof STRINGS[code][key]).toBe('string')
            )
        );
    });

    it('translate a coded error and leave the old prose path alone', () => {
        const { errorMessage } = require('../../utils/error');

        expect(
            errorMessage({
                response: { status: 409, data: { code: 'EXPENSE_IS_SHARED', error: 'raw' } },
            })
        ).toBe(EN['server.expenseIsShared']);

        // An endpoint with no code still goes through the message map.
        expect(
            errorMessage({ response: { status: 400, data: { error: 'Email is required' } } })
        ).toBe(EN['server.emailRequired']);

        // And an unmapped sentence is still shown rather than swallowed.
        expect(
            errorMessage({ response: { status: 400, data: { error: 'Something specific' } } })
        ).toBe('Something specific');
    });
});
