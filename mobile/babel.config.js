module.exports = {
  presets: ['module:metro-react-native-babel-preset'],
  // Metro resolves @tanstack/react-query to its TypeScript source rather than
  // a built bundle, and that source uses class private methods (`#foo()`).
  // React Native 0.72's preset predates those being on by default, so without
  // these three the bundle fails to transform and the app opens to a blank
  // white screen with the reason only visible in logcat.
  plugins: [
    '@babel/plugin-transform-class-properties',
    '@babel/plugin-transform-private-methods',
    '@babel/plugin-transform-private-property-in-object',
  ],
};
