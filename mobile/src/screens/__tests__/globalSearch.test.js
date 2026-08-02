import React from 'react';
import { TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { ThemeProvider } from '../../theme';
import { LanguageProvider } from '../../i18n';
import { STRINGS } from '../../i18n/strings';
import GlobalSearchScreen from '../GlobalSearchScreen';

const trigger = ReactNativeHapticFeedback.trigger;

const FOOD = { id: 1, name: 'Food & Dining', color: '#C2703D' };
const TRANSPORT = { id: 2, name: 'Transport', color: '#3D7EA6' };

const AUGUST = [
    { id: 101, amount: 250, date: '2026-08-02T10:00:00Z', notes: 'lunch', category: FOOD },
    { id: 103, amount: 60, date: '2026-08-04T10:00:00Z', notes: 'jeepney', category: TRANSPORT },
];
const JULY = [
    { id: 104, amount: 90, date: '2026-07-20T10:00:00Z', notes: 'team dinner', category: FOOD },
];

let navigation;
let client;
let fetchSpy;

const seed = ({ months = true, categories = true } = {}) => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    if (months) {
        client.setQueryData(['expenses', 2026, 8], AUGUST);
        client.setQueryData(['expenses', 2026, 7], JULY);
    }
    if (categories) {
        client.setQueryData(['categories'], [FOOD, TRANSPORT]);
    }
    return client;
};

// Every tree is tracked so afterEach can unmount it. An autofocused input and
// two providers with async effects will otherwise still be alive when Jest
// tears the environment down.
let mounted = [];

const render = async () => {
    let tree;
    await act(async () => {
        tree = renderer.create(
            <QueryClientProvider client={client}>
                <ThemeProvider>
                    <LanguageProvider>
                        <GlobalSearchScreen navigation={navigation} />
                    </LanguageProvider>
                </ThemeProvider>
            </QueryClientProvider>
        );
    });
    mounted.push(tree);
    return tree;
};

const rows = (tree) => tree.root.findAllByType(TouchableOpacity);

const texts = (tree) =>
    tree.root
        .findAll((node) => typeof node.type === 'string' && node.type === 'Text')
        .flatMap((node) => node.children)
        .filter((child) => typeof child === 'string');

const type = async (tree, value) => {
    const input = tree.root.findAll(
        (node) => typeof node.type === 'string' && node.type === 'TextInput'
    )[0];
    await act(async () => input.props.onChangeText(value));
};

beforeEach(() => {
    trigger.mockReset();
    trigger.mockImplementation(() => {});
    navigation = { navigate: jest.fn(), goBack: jest.fn() };
    // Nothing on this screen may reach the network — it reads the cache only.
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => {
        throw new Error('the search screen must not fetch');
    });
    seed();
});

afterEach(async () => {
    await act(async () => {
        mounted.forEach((tree) => tree.unmount());
    });
    mounted = [];
    fetchSpy.mockRestore();
    // React Query keeps garbage-collection timers per cache entry; clearing
    // stops them outliving the test that created them.
    client.clear();
});

describe('before anything is typed', () => {
    it('offers quick actions rather than every expense it holds', async () => {
        const tree = await render();
        const shown = texts(tree);

        expect(shown).toContain(STRINGS.en['search.groupActions']);
        expect(shown).toContain(STRINGS.en['search.actionBudget']);
        // Not a dump of the cache.
        expect(shown).not.toContain('lunch');
        expect(shown).not.toContain('jeepney');
    });

    it('says which months it actually looked at', async () => {
        // The honest part: this is a cache search, and the scope is stated
        // rather than implied to be all history.
        const tree = await render();

        expect(texts(tree)).toContain('Searching July 2026 to August 2026');
    });

    it('says so when no month has been opened yet', async () => {
        seed({ months: false });
        const tree = await render();

        expect(texts(tree)).toContain(STRINGS.en['search.scopeNone']);
    });
});

describe('searching', () => {
    it('finds an expense by its note', async () => {
        const tree = await render();
        await type(tree, 'jeepney');

        const shown = texts(tree);
        expect(shown).toContain(STRINGS.en['search.groupExpenses']);
        expect(shown).toContain('jeepney');
        expect(shown).not.toContain('lunch');
    });

    it('finds a category by name', async () => {
        const tree = await render();
        await type(tree, 'transport');

        expect(texts(tree)).toContain(STRINGS.en['search.groupCategories']);
    });

    it('searches every cached month, not only the current one', async () => {
        const tree = await render();
        await type(tree, 'dinner');

        expect(texts(tree)).toContain('team dinner');
    });

    it('ignores case and surrounding whitespace', async () => {
        const tree = await render();
        await type(tree, '  JEEPNEY  ');

        expect(texts(tree)).toContain('jeepney');
    });

    it('shows a no-results state that names the scope it searched', async () => {
        // "It is not there" and "it was not looked at" must not be confusable.
        const tree = await render();
        await type(tree, 'helicopter');

        const shown = texts(tree).join(' ');
        expect(shown).toContain(STRINGS.en['search.noResultsTitle']);
        expect(shown).toContain('helicopter');
        expect(shown).toContain('Searching July 2026 to August 2026');
    });

    it('clears back to quick actions', async () => {
        const tree = await render();
        await type(tree, 'jeepney');
        expect(texts(tree)).not.toContain(STRINGS.en['search.actionBudget']);

        await type(tree, '');

        expect(texts(tree)).toContain(STRINGS.en['search.actionBudget']);
        expect(texts(tree)).not.toContain('jeepney');
    });

    it('never reaches the network, however much is typed', async () => {
        const tree = await render();

        for (const value of ['j', 'je', 'jee', 'jeep', 'jeepney']) {
            await type(tree, value);
        }

        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe('acting on a result', () => {
    const tapNamed = async (tree, label) => {
        const row = rows(tree).find((r) => r.props.accessibilityLabel === label);
        expect(row).toBeDefined();
        await act(async () => row.props.onPress());
        return row;
    };

    it('opens the exact expense that was tapped', async () => {
        const tree = await render();
        await type(tree, 'jeepney');

        const row = rows(tree).find((r) => String(r.props.accessibilityLabel).startsWith('jeepney'));
        await act(async () => row.props.onPress());

        expect(navigation.navigate).toHaveBeenCalledWith('EditExpense', {
            expense: expect.objectContaining({ id: 103 }),
        });
    });

    it('opens the categories screen from a category result', async () => {
        const tree = await render();
        await type(tree, 'transport');

        await tapNamed(tree, 'Transport');

        expect(navigation.navigate).toHaveBeenCalledWith('Categories');
    });

    it('reaches a tab through the tab navigator, and a stack screen directly', async () => {
        const tree = await render();

        await tapNamed(tree, STRINGS.en['search.actionBudget']);
        expect(navigation.navigate).toHaveBeenCalledWith('Main', { screen: 'Budget' });

        const fresh = await render();
        await tapNamed(fresh, STRINGS.en['search.actionReports']);
        expect(navigation.navigate).toHaveBeenCalledWith('Reports');
    });

    it('navigates once however many times a result is tapped', async () => {
        // Two taps land in one React batch before the screen unmounts.
        const tree = await render();
        const row = rows(tree).find(
            (r) => r.props.accessibilityLabel === STRINGS.en['search.actionBudget']
        );

        await act(async () => {
            row.props.onPress();
            row.props.onPress();
            row.props.onPress();
        });

        expect(navigation.navigate).toHaveBeenCalledTimes(1);
        expect(trigger).toHaveBeenCalledTimes(1);
    });

    it('taps lightly on selection, and not while typing', async () => {
        const tree = await render();

        await type(tree, 'jeepney');
        expect(trigger).not.toHaveBeenCalled();

        const row = rows(tree).find((r) => String(r.props.accessibilityLabel).startsWith('jeepney'));
        await act(async () => row.props.onPress());

        expect(trigger).toHaveBeenCalledTimes(1);
        expect(trigger).toHaveBeenCalledWith('impactLight', expect.any(Object));
    });
});

describe('resilience', () => {
    it('still searches expenses when categories were never loaded', async () => {
        seed({ categories: false });
        const tree = await render();
        await type(tree, 'jeepney');

        expect(texts(tree)).toContain('jeepney');
        expect(texts(tree)).not.toContain(STRINGS.en['search.groupCategories']);
    });

    it('has wording for every language', () => {
        const keys = [
            'search.title',
            'search.placeholder',
            'search.groupActions',
            'search.groupExpenses',
            'search.groupCategories',
            'search.noResultsTitle',
            'search.scopeNone',
            'search.clear',
        ];

        ['en', 'fil', 'ceb'].forEach((code) => {
            keys.forEach((key) => {
                expect(typeof STRINGS[code][key]).toBe('string');
                expect(STRINGS[code][key].trim()).not.toBe('');
            });
        });
    });
});
