import React from 'react';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, { act } from 'react-test-renderer';

import { ThemeProvider } from '../../theme';
import { LanguageProvider } from '../../i18n';
import { STRINGS } from '../../i18n/strings';
import ErrorBoundary from '../ErrorBoundary';
import { reportFatal, isCrashReportingActive } from '../../services/crashReporting';

jest.mock('../../services/crashReporting', () => ({
    reportFatal: jest.fn(),
    isCrashReportingActive: jest.fn(() => false),
}));

// React writes the caught error to the console itself. That is not a test
// failure, and letting it print buries the real output.
let consoleError;

beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
    consoleError.mockRestore();
    await AsyncStorage.clear();
});

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

const texts = (tree) =>
    tree.root
        .findAll((node) => typeof node.type === 'string' && node.type === 'Text')
        .flatMap((node) => node.children)
        .filter((child) => typeof child === 'string');

const Boom = () => {
    throw new Error('TypeError: cannot read property amount of undefined');
};

const Fine = () => <Text>the real screen</Text>;

describe('when nothing is wrong', () => {
    it('renders its children untouched', async () => {
        const tree = await render(
            <ErrorBoundary>
                <Fine />
            </ErrorBoundary>
        );

        expect(texts(tree)).toContain('the real screen');
        expect(reportFatal).not.toHaveBeenCalled();
    });
});

describe('when a screen throws', () => {
    it('shows the recovery screen instead of a white rectangle', async () => {
        const tree = await render(
            <ErrorBoundary>
                <Boom />
            </ErrorBoundary>
        );

        const shown = texts(tree);
        expect(shown).toContain(STRINGS.en['crash.title']);
        expect(shown).toContain(STRINGS.en['crash.message']);
        expect(shown).toContain(STRINGS.en['errors.tryAgain']);
    });

    it('never puts the error or a stack trace in front of the user', async () => {
        const tree = await render(
            <ErrorBoundary>
                <Boom />
            </ErrorBoundary>
        );

        const shown = texts(tree).join(' ');
        expect(shown).not.toContain('TypeError');
        expect(shown).not.toContain('cannot read property');
        expect(shown).not.toContain('amount');
        expect(shown).not.toMatch(/\bat\s+\w+\s+\(/);
    });

    it('reports the crash with the component stack', async () => {
        await render(
            <ErrorBoundary>
                <Boom />
            </ErrorBoundary>
        );

        expect(reportFatal).toHaveBeenCalledTimes(1);
        const [error, componentStack] = reportFatal.mock.calls[0];
        expect(error).toBeInstanceOf(Error);
        expect(typeof componentStack).toBe('string');
        expect(componentStack).toContain('Boom');
    });

    it('claims a report was sent only when one actually was', async () => {
        isCrashReportingActive.mockReturnValue(false);
        const off = await render(
            <ErrorBoundary>
                <Boom />
            </ErrorBoundary>
        );
        expect(texts(off)).not.toContain(STRINGS.en['crash.reported']);

        isCrashReportingActive.mockReturnValue(true);
        const on = await render(
            <ErrorBoundary>
                <Boom />
            </ErrorBoundary>
        );
        expect(texts(on)).toContain(STRINGS.en['crash.reported']);
    });
});

describe('recovering', () => {
    it('goes back to the screen once the retry clears the bad state', async () => {
        // One render throws, the next does not — which is the shape of most
        // render crashes: one bad piece of state that the remount discards.
        let shouldThrow = true;
        const Flaky = () => {
            if (shouldThrow) {
                throw new Error('boom');
            }
            return <Text>the real screen</Text>;
        };

        const tree = await render(
            <ErrorBoundary>
                <Flaky />
            </ErrorBoundary>
        );

        expect(texts(tree)).toContain(STRINGS.en['crash.title']);

        shouldThrow = false;
        const retry = tree.root.findAll(
            (node) => typeof node.type !== 'string' && node.props?.onPress
        );
        await act(async () => {
            retry[retry.length - 1].props.onPress();
        });

        expect(texts(tree)).toContain('the real screen');
        expect(texts(tree)).not.toContain(STRINGS.en['crash.title']);
    });
});

describe('translation', () => {
    it('speaks the language the user chose', async () => {
        // The provider reads the stored preference on mount, so seeding
        // storage is how a test picks a language.
        await AsyncStorage.setItem('appLanguage', 'fil');

        const tree = await render(
            <ErrorBoundary>
                <Boom />
            </ErrorBoundary>
        );

        const shown = texts(tree);
        expect(shown).toContain(STRINGS.fil['crash.title']);
        expect(shown).not.toContain(STRINGS.en['crash.title']);
    });

    it('has wording for every language, so none of it can fall back to English', () => {
        ['en', 'fil', 'ceb'].forEach((code) => {
            ['crash.title', 'crash.message', 'crash.reported'].forEach((key) => {
                expect({ code, key, text: STRINGS[code][key] }).toEqual({
                    code,
                    key,
                    text: expect.any(String),
                });
                expect(STRINGS[code][key].trim()).not.toBe('');
            });
        });
    });
});
