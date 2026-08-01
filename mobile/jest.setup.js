// AsyncStorage is a native module, so it has no implementation under Jest.
// The package ships an in-memory mock for exactly this. Without it, importing
// anything that reaches the theme or i18n providers throws at require time.
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
