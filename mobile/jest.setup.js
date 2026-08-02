// AsyncStorage is a native module, so it has no implementation under Jest.
// The package ships an in-memory mock for exactly this. Without it, importing
// anything that reaches the theme or i18n providers throws at require time.
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// gesture-handler replaces parts of React Native's own touch machinery, and
// importing it under Jest without this leaves react-native half-mocked —
// which surfaces as useColorScheme not being a function, several layers away
// from anything to do with gestures.
require('react-native-gesture-handler/jestSetup');

// Haptics are a native module too. Stubbed by default so anything that merely
// imports the wrapper can be rendered; the tests that care assert against this
// same trigger.
jest.mock('react-native-haptic-feedback', () => ({
    __esModule: true,
    default: { trigger: jest.fn() },
    trigger: jest.fn(),
}));

// The Sentry SDK binds to native modules at import time, which do not exist
// under Jest. A default stub here keeps anything that merely imports the crash
// reporter renderable; the tests that assert on the SDK replace this with their
// own richer mock.
jest.mock('@sentry/react-native', () => ({
    init: jest.fn(),
    captureException: jest.fn(),
    withScope: jest.fn((callback) =>
        callback({ setLevel: jest.fn(), setTag: jest.fn(), setContext: jest.fn() })
    ),
}));
