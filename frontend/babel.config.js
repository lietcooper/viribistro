module.exports = function (api) {
  const isTest = api.env('test');
  api.cache.using(() => isTest);

  return {
    presets: [
      // In test env we skip NativeWind's JSX runtime so we don't drag in
      // react-native-css-interop's babel plugin (which references a
      // worklets plugin that isn't installable on RN 0.76). In tests
      // `className` becomes a no-op prop on RN primitives — behaviour
      // tests don't assert on Tailwind-derived styles.
      ['babel-preset-expo', { jsxImportSource: isTest ? 'react' : 'nativewind' }],
      ...(isTest ? [] : ['nativewind/babel']),
    ],
    plugins: [
      // Reanimated plugin must always be last.
      'react-native-reanimated/plugin',
    ],
  };
};
