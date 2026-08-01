module.exports = {
  presets: ['module:metro-react-native-babel-preset'],
  // Metro resolves @tanstack/react-query to its TypeScript source rather than
  // a built bundle, and that source uses class private methods (`#foo()`).
  // React Native 0.72's preset predates those being on by default, so without
  // these three the bundle fails to transform and the app opens to a blank
  // white screen with the reason only visible in logcat.
  //
  // They are scoped to that package deliberately. Applied globally they run
  // ahead of the preset's Flow transform, so React Native's own type-only
  // class property declarations — `props: Props;` in FlatList,
  // `onreadystatechange: ?Function;` in XMLHttpRequest — stop being erased and
  // become real field initialisations instead. That wipes `this.props` right
  // after `super(props)` set it, and shadows the event accessors that
  // event-target-shim installs on the prototype. The symptoms are a long way
  // from the cause: every list screen crashes with "Cannot read property
  // 'getItem' of undefined", and every network request completes but never
  // calls its handler, so requests hang forever with no error and no timeout.
  overrides: [
    {
      test: /node_modules[\\/]@tanstack[\\/]/,
      plugins: [
        '@babel/plugin-transform-class-properties',
        '@babel/plugin-transform-private-methods',
        '@babel/plugin-transform-private-property-in-object',
      ],
    },
  ],
};
