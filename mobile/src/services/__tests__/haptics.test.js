import fs from 'fs';
import path from 'path';

import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import haptics from '../haptics';

const trigger = ReactNativeHapticFeedback.trigger;

beforeEach(() => {
    trigger.mockReset();
    trigger.mockImplementation(() => {});
});

describe('the four taps', () => {
    it.each([
        ['light', 'impactLight'],
        ['success', 'notificationSuccess'],
        ['warning', 'notificationWarning'],
        ['error', 'notificationError'],
    ])('haptics.%s fires the %s pattern, once', (name, type) => {
        expect(haptics[name]()).toBe(true);

        expect(trigger).toHaveBeenCalledTimes(1);
        expect(trigger).toHaveBeenCalledWith(type, expect.any(Object));
    });

    it('leaves a device with haptics switched off alone', () => {
        // Falling back to a raw buzz would override a preference the user has
        // already expressed to the system.
        haptics.success();

        const [, options] = trigger.mock.calls[0];
        expect(options.enableVibrateFallback).toBe(false);
        expect(options.ignoreAndroidSystemSettings).toBe(false);
    });
});

describe('carrying nothing with it', () => {
    it('takes no arguments, so nothing about the action can travel', () => {
        // There is no amount, category, account or route to attach — the
        // signatures make that impossible rather than merely unlikely.
        ['light', 'success', 'warning', 'error'].forEach((name) => {
            expect(haptics[name]).toHaveLength(0);
        });
    });

    it('sends only a pattern name and its options', () => {
        haptics.success();

        expect(trigger.mock.calls[0]).toHaveLength(2);
        expect(JSON.stringify(trigger.mock.calls[0])).not.toMatch(/₱|amount|email|token|category/i);
    });
});

describe('when the device cannot do it', () => {
    it('swallows a throwing native module rather than losing the save', () => {
        // A manufacturer ROM that throws is not a reason for a saved expense
        // to become a crash — the visual confirmation already happened.
        trigger.mockImplementation(() => {
            throw new Error('no vibrator on this device');
        });

        expect(() => haptics.success()).not.toThrow();
        expect(haptics.success()).toBe(false);
    });

    it('no-ops when the native module has no trigger at all', () => {
        const original = ReactNativeHapticFeedback.trigger;
        delete ReactNativeHapticFeedback.trigger;

        expect(() => haptics.light()).not.toThrow();
        expect(haptics.light()).toBe(false);

        ReactNativeHapticFeedback.trigger = original;
    });
});

// Read off disk. These are invariants about where haptics may appear at all,
// and they hold whether or not a screen can be rendered in this suite.
describe('where haptics are allowed to fire', () => {
    const src = (...segments) =>
        fs.readFileSync(path.join(__dirname, '..', '..', ...segments), 'utf8');

    const SILENT_SURFACES = [
        // Every digit of an amount would be a dozen buzzes for one expense.
        ['components', 'AmountKeypad.js'],
        // Loading is not an event the user caused.
        ['components', 'Skeleton.js'],
        ['components', 'ScreenSkeletons.js'],
        // Navigation taps and screen appearance.
        ['navigation', 'AppNavigator.js'],
        // Passive failures nobody was waiting on.
        ['components', 'ErrorState.js'],
        ['components', 'ErrorBanner.js'],
        ['components', 'Snackbar.js'],
    ];

    it.each(SILENT_SURFACES)('%s/%s never vibrates', (folder, file) => {
        expect(src(folder, file)).not.toMatch(/haptics?\./);
    });

    it('never celebrates an optimistic delete', () => {
        // The expenses list removes the row five seconds before the request is
        // sent. A success there would be congratulating a deletion that has
        // not happened and might still be undone.
        const expenses = src('screens', 'ExpensesScreen.js');

        expect(expenses).toMatch(/haptics\.light\(\)/);
        expect(expenses).not.toMatch(/haptics\.success\(\)/);
    });

    it('only ever reports success after something was awaited', () => {
        // Success means the server agreed. Every screen that claims it must
        // have waited for an answer first.
        const screens = fs
            .readdirSync(path.join(__dirname, '..', '..', 'screens'))
            .filter((file) => file.endsWith('.js'));

        screens.forEach((file) => {
            const source = src('screens', file);
            if (!source.includes('haptics.success()')) {
                return;
            }

            const beforeFirstSuccess = source.slice(0, source.indexOf('haptics.success()'));
            expect({ file, awaited: beforeFirstSuccess.includes('await ') }).toEqual({
                file,
                awaited: true,
            });
        });
    });
});
