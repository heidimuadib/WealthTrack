import fs from 'fs';
import path from 'path';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));

// Never reaches the network. Each test seeds the cache instead, so a query that
// misses simply stays pending rather than opening a socket.
jest.mock('../../services/groups', () => {
    const pending = () => jest.fn(() => new Promise(() => {}));
    return {
        groupService: {
            list: pending(),
            get: pending(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            archive: jest.fn(),
            unarchive: jest.fn(),
        },
        groupMemberService: {
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            archive: jest.fn(),
            unarchive: jest.fn(),
        },
        sharedExpenseService: { list: pending() },
        groupBalanceService: { get: pending() },
        settlementService: { list: pending() },
    };
});

import { groupService, groupMemberService } from '../../services/groups';
import { ThemeProvider } from '../../theme';
import { LanguageProvider } from '../../i18n';
import { FeedbackProvider } from '../../components/FeedbackProvider';
import { STRINGS } from '../../i18n/strings';
import { queryKeys } from '../../lib/queryKeys';
import GroupsScreen from '../groups/GroupsScreen';
import CreateGroupScreen from '../groups/CreateGroupScreen';
import EditGroupScreen from '../groups/EditGroupScreen';
import GroupDetailScreen from '../groups/GroupDetailScreen';
import ManageGroupMembersScreen from '../groups/ManageGroupMembersScreen';

const EN = STRINGS.en;
const SRC = path.join(__dirname, '..', '..');
const read = (...segments) => fs.readFileSync(path.join(SRC, ...segments), 'utf8');

const GROUP_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const SAFE_AREA = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

const SELF = { id: 'm-self', name: 'Paul', isCurrentUser: true, archivedAt: null, contactNote: null };
const JOHN = { id: 'm-john', name: 'John', isCurrentUser: false, archivedAt: null, contactNote: '0917' };
const GONE = {
    id: 'm-gone',
    name: 'Carl',
    isCurrentUser: false,
    archivedAt: '2026-08-01T00:00:00.000Z',
    contactNote: null,
};

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
// Finds a touchable by the visible text inside it.
const byText = (tree, label) =>
    touchables(tree).find((node) =>
        node
            .findAll((child) => typeof child.type === 'string' && child.type === 'Text')
            .flatMap((child) => child.children)
            .includes(label)
    );

// Deliberately does not return the handler's promise. Anything that opens a
// confirmation awaits a promise that only settles when the dialog is answered,
// so returning it here would make act() wait for a button this same test has
// not pressed yet — and hang forever.
const press = async (node) => {
    await act(async () => {
        node.props.onPress();
    });
};

// Lets the handler's own promise settle. Needed because press() deliberately
// does not await it.
const flush = async () => {
    await act(async () => {});
};

// A dialog or sheet button often repeats a label already on the screen behind
// it — "Delete group" is both the screen's action and the dialog's confirm.
// The one on top is the last one rendered.
const lastByText = (tree, label) => {
    const matches = touchables(tree).filter((node) =>
        node
            .findAll((child) => typeof child.type === 'string' && child.type === 'Text')
            .flatMap((child) => child.children)
            .includes(label)
    );
    return matches[matches.length - 1];
};

beforeEach(() => {
    navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
    client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    [groupService, groupMemberService].forEach((service) =>
        Object.values(service).forEach((fn) => fn.mockReset?.())
    );
    groupService.list.mockImplementation(() => new Promise(() => {}));
    groupService.get.mockImplementation(() => new Promise(() => {}));
});

afterEach(async () => {
    await act(async () => {
        mounted.forEach((tree) => tree.unmount());
    });
    mounted = [];
});

// ---------------------------------------------------------------------------

describe('groups list', () => {
    const seedList = (active = [], archived = []) => {
        client.setQueryData(queryKeys.groups.list(false), active);
        client.setQueryData(queryKeys.groups.list(true), archived);
    };

    it('shows active groups with a member count', async () => {
        seedList([{ ...group(), memberCount: 3 }]);
        const tree = await render(<GroupsScreen navigation={navigation} />);

        expect(texts(tree)).toContain('Cebu');
        expect(texts(tree)).toContain(EN['groups.memberMany'].replace('{count}', '3'));
    });

    it('says one member in the singular', async () => {
        seedList([{ ...group(), memberCount: 1 }]);
        const tree = await render(<GroupsScreen navigation={navigation} />);
        expect(texts(tree)).toContain(EN['groups.memberOne']);
    });

    it('shows no balance of any kind', async () => {
        seedList([group()]);
        const tree = await render(<GroupsScreen navigation={navigation} />);
        const shown = texts(tree).join(' ');

        // The list endpoint carries no figures. A zero would be
        // indistinguishable from a settled group.
        expect(shown).not.toMatch(/₱|owed|owe\b|settled/i);
    });

    it('keeps archived groups off the active tab until asked', async () => {
        seedList([group()], [group({ id: 'other', name: 'Bohol', archivedAt: 'x' })]);
        const tree = await render(<GroupsScreen navigation={navigation} />);

        expect(texts(tree)).toContain('Cebu');
        expect(texts(tree)).not.toContain('Bohol');

        await press(byLabel(tree, EN['groups.tabArchived']));

        expect(texts(tree)).toContain('Bohol');
        expect(texts(tree)).not.toContain('Cebu');
    });

    it('announces the archived state rather than only styling it', async () => {
        seedList([], [group({ archivedAt: '2026-08-01T00:00:00.000Z' })]);
        const tree = await render(<GroupsScreen navigation={navigation} />);
        await press(byLabel(tree, EN['groups.tabArchived']));

        const card = touchables(tree).find((node) =>
            String(node.props.accessibilityLabel || '').startsWith('Cebu')
        );
        expect(card.props.accessibilityLabel).toContain(EN['groups.archivedBadge']);
    });

    it('opens the group it was tapped on', async () => {
        seedList([group()]);
        const tree = await render(<GroupsScreen navigation={navigation} />);

        const card = touchables(tree).find((node) =>
            String(node.props.accessibilityLabel || '').startsWith('Cebu')
        );
        await press(card);

        expect(navigation.navigate).toHaveBeenCalledWith('GroupDetail', { groupId: GROUP_ID });
    });

    it('teaches the use case when there is nothing yet', async () => {
        seedList([]);
        const tree = await render(<GroupsScreen navigation={navigation} />);

        expect(texts(tree)).toContain(EN['groups.emptyTitle']);
        expect(texts(tree).join(' ')).toContain('do not need WealthTrack');
    });

    it('offers no create action from the archived tab', async () => {
        seedList([], []);
        const tree = await render(<GroupsScreen navigation={navigation} />);
        await press(byLabel(tree, EN['groups.tabArchived']));

        expect(texts(tree)).toContain(EN['groups.emptyArchivedTitle']);
        expect(texts(tree)).not.toContain(EN['groups.create']);
    });

    it('shows a skeleton with no invented names or figures', async () => {
        const tree = await render(<GroupsScreen navigation={navigation} />);
        const shown = texts(tree).join(' ');

        expect(shown).not.toMatch(/₱|Cebu|\d/);
        expect(shown).not.toContain(EN['groups.emptyTitle']);
    });

    it('keeps the toggle targets tappable', async () => {
        seedList([]);
        const tree = await render(<GroupsScreen navigation={navigation} />);

        [EN['groups.tabActive'], EN['groups.tabArchived']].forEach((label) => {
            const style = byLabel(tree, label).props.style;
            const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
            expect(flat.minHeight).toBeGreaterThanOrEqual(44);
        });
    });
});

describe('creating a group', () => {
    it('will not submit without a name', async () => {
        const tree = await render(<CreateGroupScreen navigation={navigation} />);
        const save = byText(tree, EN['groups.saveNew']);

        expect(save.props.disabled).toBe(true);
        expect(groupService.create).not.toHaveBeenCalled();
    });

    it('trims and sends only what the server owns', async () => {
        groupService.create.mockResolvedValue({ data: group() });
        const tree = await render(<CreateGroupScreen navigation={navigation} />);

        const input = tree.root.findAll(
            (node) => typeof node.type === 'string' && node.type === 'TextInput'
        )[0];
        await act(async () => input.props.onChangeText('  Cebu  '));
        await press(byText(tree, EN['groups.saveNew']));
        await flush();

        // create takes the body alone; the group has no id yet.
        const [body] = groupService.create.mock.calls[0];
        expect(body.name).toBe('Cebu');
        // The self-member is the server's to create, in the same transaction.
        expect(body).not.toHaveProperty('members');
        expect(body).not.toHaveProperty('isCurrentUser');
        expect(body).not.toHaveProperty('userId');
    });

    it('goes to the member list once, replacing itself', async () => {
        groupService.create.mockResolvedValue({ data: group() });
        const tree = await render(<CreateGroupScreen navigation={navigation} />);

        const input = tree.root.findAll(
            (node) => typeof node.type === 'string' && node.type === 'TextInput'
        )[0];
        await act(async () => input.props.onChangeText('Cebu'));
        await press(byText(tree, EN['groups.saveNew']));
        await flush();

        // replace, not navigate: going back from the members list should reach
        // the groups list, not a create form for a group that now exists.
        expect(navigation.replace).toHaveBeenCalledTimes(1);
        expect(navigation.replace).toHaveBeenCalledWith('ManageGroupMembers', {
            groupId: GROUP_ID,
        });
        expect(navigation.navigate).not.toHaveBeenCalled();
    });

    it('submits once even if the button is tapped twice', async () => {
        let resolve;
        groupService.create.mockImplementation(
            () => new Promise((done) => { resolve = () => done({ data: group() }); })
        );

        const tree = await render(<CreateGroupScreen navigation={navigation} />);
        const input = tree.root.findAll(
            (node) => typeof node.type === 'string' && node.type === 'TextInput'
        )[0];
        await act(async () => input.props.onChangeText('Cebu'));

        const save = byText(tree, EN['groups.saveNew']);
        await act(async () => {
            save.props.onPress();
            save.props.onPress();
        });

        expect(groupService.create).toHaveBeenCalledTimes(1);
        await act(async () => resolve());
    });
});

describe('editing a group', () => {
    beforeEach(() => {
        client.setQueryData(queryKeys.groups.detail(GROUP_ID), group());
    });

    const screen = () =>
        render(<EditGroupScreen navigation={navigation} route={{ params: { groupId: GROUP_ID } }} />);

    it('preloads the group', async () => {
        const tree = await screen();
        const inputs = tree.root.findAll(
            (node) => typeof node.type === 'string' && node.type === 'TextInput'
        );
        expect(inputs[0].props.value).toBe('Cebu');
        expect(inputs[1].props.value).toBe('Weekend trip');
    });

    it('sends only name, description and colour', async () => {
        groupService.update.mockResolvedValue({ data: group() });
        const tree = await screen();
        await press(byText(tree, EN['groups.saveChanges']));
        await flush();

        const [, body] = groupService.update.mock.calls[0];
        expect(Object.keys(body).sort()).toEqual(['color', 'description', 'name']);
    });

    it('offers no form at all while archived', async () => {
        client.setQueryData(
            queryKeys.groups.detail(GROUP_ID),
            group({ archivedAt: '2026-08-01T00:00:00.000Z' })
        );
        const tree = await screen();

        // A save that is certain to be refused should not be reachable.
        expect(texts(tree)).not.toContain(EN['groups.saveChanges']);
        expect(texts(tree)).toContain(EN['groups.archivedNotice']);
        expect(texts(tree)).toContain(EN['groups.unarchive']);
    });

    it('teaches archive when a group has history', async () => {
        groupService.remove.mockRejectedValue({
            response: { status: 409, data: { code: 'GROUP_HAS_HISTORY', error: 'raw' } },
        });
        const tree = await screen();

        await press(byText(tree, EN['groups.delete']));
        await press(lastByText(tree, EN['groups.delete']));
        await flush();

        // The server's own sentence explains why; the dialog offers the way out.
        expect(texts(tree).join(' ')).toContain(EN['server.groupHasHistory']);
        expect(texts(tree)).toContain(EN['groups.archiveInstead']);
    });
});

describe('group detail', () => {
    beforeEach(() => {
        client.setQueryData(queryKeys.groups.detail(GROUP_ID), group());
    });

    const screen = (overrides) => {
        if (overrides) {
            client.setQueryData(queryKeys.groups.detail(GROUP_ID), group(overrides));
        }
        return render(
            <GroupDetailScreen navigation={navigation} route={{ params: { groupId: GROUP_ID } }} />
        );
    };

    it('shows the group and its members', async () => {
        const tree = await screen();
        expect(texts(tree)).toContain('Cebu');
        expect(texts(tree)).toContain(EN['members.you']);
        expect(texts(tree)).toContain('John');
    });

    it('still shows no balance', async () => {
        const tree = await screen();
        const shown = texts(tree).join(' ');

        // Expenses arrived with the editor; who owes whom did not. A figure
        // here would be one no endpoint this screen calls actually returns.
        expect(shown).not.toMatch(/owed|owes|settle/i);
    });

    it('offers the add-expense action now that the editor exists', async () => {
        const tree = await screen();
        expect(texts(tree)).toContain(EN['shared.add']);
    });

    it('withholds it on an archived group', async () => {
        const tree = await screen({ archivedAt: '2026-08-01T00:00:00.000Z' });
        expect(texts(tree)).not.toContain(EN['shared.add']);
    });

    it('opens member management', async () => {
        const tree = await screen();
        await press(byLabel(tree, EN['groups.manageMembers']));
        expect(navigation.navigate).toHaveBeenCalledWith('ManageGroupMembers', {
            groupId: GROUP_ID,
        });
    });

    it('stays readable when archived, offering only unarchive', async () => {
        const tree = await screen({ archivedAt: '2026-08-01T00:00:00.000Z' });

        expect(texts(tree)).toContain('Cebu');
        expect(texts(tree)).toContain(EN['groups.archivedNotice']);
        expect(texts(tree)).toContain(EN['groups.unarchive']);
        expect(texts(tree)).not.toContain(EN['groups.editGroup']);
    });
});

describe('managing members', () => {
    beforeEach(() => {
        client.setQueryData(queryKeys.groups.detail(GROUP_ID), group());
    });

    const screen = (overrides) => {
        if (overrides) {
            client.setQueryData(queryKeys.groups.detail(GROUP_ID), group(overrides));
        }
        return render(
            <ManageGroupMembersScreen
                navigation={navigation}
                route={{ params: { groupId: GROUP_ID } }}
            />
        );
    };

    const openSheetFor = async (tree, name) => {
        await press(byLabel(tree, EN['members.a11yActions'].replace('{name}', name)));
    };

    it('separates you, the group, and the people who left', async () => {
        const tree = await screen();
        const shown = texts(tree);

        expect(shown).toContain(EN['members.you']);
        expect(shown).toContain(EN['members.active']);
        expect(shown).toContain(EN['members.archivedSection']);
    });

    it('announces each row with its status, and the full name', async () => {
        const tree = await screen({
            members: [SELF, { ...JOHN, name: 'Jonathan Bartholomew Villanueva' }, GONE],
        });

        const labels = tree.root
            .findAll((node) => node.props?.accessibilityLabel)
            .map((node) => node.props.accessibilityLabel);

        expect(labels).toContain(EN['members.a11yYou'].replace('{name}', 'Paul'));
        expect(labels).toContain(EN['members.a11yArchived'].replace('{name}', 'Carl'));
        // Truncated on screen, whole in the label.
        expect(labels).toContain('Jonathan Bartholomew Villanueva');
    });

    it('never offers archive or delete for you', async () => {
        const tree = await screen();
        await openSheetFor(tree, 'Paul');

        const shown = texts(tree);
        expect(shown).toContain(EN['members.edit']);
        expect(shown).not.toContain(EN['members.archive']);
        expect(shown).not.toContain(EN['members.delete']);
    });

    it('offers archive and delete for everybody else', async () => {
        const tree = await screen();
        await openSheetFor(tree, 'John');

        const shown = texts(tree);
        expect(shown).toContain(EN['members.archive']);
        expect(shown).toContain(EN['members.delete']);
    });

    it('offers unarchive for somebody who left', async () => {
        const tree = await screen();
        await openSheetFor(tree, 'Carl');
        expect(texts(tree)).toContain(EN['members.unarchive']);
    });

    it('adds a member without ever sending isCurrentUser', async () => {
        groupMemberService.create.mockResolvedValue({ data: { id: 'new' } });
        const tree = await screen();

        await press(byText(tree, EN['members.add']));
        const input = tree.root.findAll(
            (node) => typeof node.type === 'string' && node.type === 'TextInput'
        )[0];
        await act(async () => input.props.onChangeText('Mike'));
        await press(lastByText(tree, EN['members.add']));
        await flush();

        const [, body] = groupMemberService.create.mock.calls[0];
        expect(body.name).toBe('Mike');
        expect(body).not.toHaveProperty('isCurrentUser');
    });

    it('teaches archive when a member appears on expenses', async () => {
        groupMemberService.remove.mockRejectedValue({
            response: { status: 409, data: { code: 'MEMBER_HAS_HISTORY', error: 'raw' } },
        });
        const tree = await screen();

        await openSheetFor(tree, 'John');
        await press(lastByText(tree, EN['members.delete']));
        await press(lastByText(tree, EN['members.delete'])); // confirm the dialog
        await flush();

        expect(texts(tree).join(' ')).toContain(EN['server.memberHasHistory']);
        expect(texts(tree)).toContain(EN['members.archive']);
    });

    it('offers nothing to change while the group is archived', async () => {
        const tree = await screen({ archivedAt: '2026-08-01T00:00:00.000Z' });

        expect(texts(tree)).not.toContain(EN['members.add']);
        expect(
            byLabel(tree, EN['members.a11yActions'].replace('{name}', 'John'))
        ).toBeUndefined();
    });

    it('keeps the options target tappable', async () => {
        const tree = await screen();
        const button = byLabel(tree, EN['members.a11yActions'].replace('{name}', 'John'));
        const style = button.props.style;
        const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;

        expect(flat.width).toBeGreaterThanOrEqual(44);
        expect(flat.height).toBeGreaterThanOrEqual(44);
    });
});

describe('localization', () => {
    const KEYS = Object.keys(EN).filter(
        (key) =>
            key.startsWith('groups.') ||
            key.startsWith('members.') ||
            key === 'loading.groups' ||
            [
                'server.groupHasHistory',
                'server.duplicateGroupName',
                'server.duplicateMemberName',
                'server.selfMemberProtected',
                'server.memberHasHistory',
                'server.memberNotFound',
                'server.readOnlyField',
                'server.invalidColor',
            ].includes(key)
    );

    it('covers every key in all three languages', () => {
        expect(KEYS.length).toBeGreaterThan(60);
        KEYS.forEach((key) =>
            ['fil', 'ceb'].forEach((code) => {
                const value = STRINGS[code][key];
                expect({ key, code, ok: typeof value === 'string' && value.trim() !== '' }).toEqual({
                    key,
                    code,
                    ok: true,
                });
            })
        );
    });

    it('keeps placeholders identical across languages', () => {
        const placeholders = (text) => (String(text).match(/\{[a-z]+\}/gi) || []).sort();

        KEYS.forEach((key) => {
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

    it('maps only codes the backend actually returns', () => {
        const { SERVER_CODE_KEYS } = require('../../utils/serverErrors');
        const backend = fs.readFileSync(
            path.join(SRC, '..', '..', 'backend', 'src', 'controllers', 'group.controller.js'),
            'utf8'
        );
        const member = fs.readFileSync(
            path.join(SRC, '..', '..', 'backend', 'src', 'controllers', 'groupMember.controller.js'),
            'utf8'
        );
        const access = fs.readFileSync(
            path.join(SRC, '..', '..', 'backend', 'src', 'lib', 'groupAccess.js'),
            'utf8'
        );
        const validation = fs.readFileSync(
            path.join(SRC, '..', '..', 'backend', 'src', 'lib', 'groupValidation.js'),
            'utf8'
        );
        const expense = fs.readFileSync(
            path.join(SRC, '..', '..', 'backend', 'src', 'controllers', 'expense.controller.js'),
            'utf8'
        );
        const sharedExpense = fs.readFileSync(
            path.join(
                SRC, '..', '..', 'backend', 'src', 'controllers', 'sharedExpense.controller.js'
            ),
            'utf8'
        );
        const settlement = fs.readFileSync(
            path.join(SRC, '..', '..', 'backend', 'src', 'controllers', 'settlement.controller.js'),
            'utf8'
        );
        const source =
            backend + member + access + validation + expense + sharedExpense + settlement;

        // A code the server never sends is a translation nobody ever sees.
        Object.keys(SERVER_CODE_KEYS).forEach((code) =>
            expect({ code, sent: source.includes(`'${code}'`) }).toEqual({ code, sent: true })
        );
    });
});

describe('privacy', () => {
    const FILES = [
        ['screens', 'groups', 'GroupsScreen.js'],
        ['screens', 'groups', 'CreateGroupScreen.js'],
        ['screens', 'groups', 'EditGroupScreen.js'],
        ['screens', 'groups', 'GroupDetailScreen.js'],
        ['screens', 'groups', 'ManageGroupMembersScreen.js'],
        ['components', 'MemberEditor.js'],
        ['components', 'GroupForm.js'],
    ];

    it.each([
        ['logs nothing', /console\./],
        ['persists nothing on the device', /AsyncStorage/],
        ['adds no breadcrumbs', /Sentry|addBreadcrumb/],
    ])('%s', (_label, pattern) => {
        FILES.forEach((segments) => {
            const source = read(...segments);
            expect({ file: segments.join('/'), found: pattern.test(source) }).toEqual({
                file: segments.join('/'),
                found: false,
            });
        });
    });

    it('carries only ids between screens', () => {
        FILES.forEach((segments) => {
            const source = read(...segments);
            const navigations = source.match(/navigate\([^)]*\)/g) || [];
            navigations.forEach((call) =>
                expect({ file: segments.join('/'), call, leaks: /name:|member:|group:\s*\{/.test(call) }).toEqual(
                    { file: segments.join('/'), call, leaks: false }
                )
            );
        });
    });
});
