// Mock react-native-reanimated. The library ships an official mock that
// turns shared values into plain objects and animation helpers into
// pass-through fns so we can spy on them and run components under Jest.
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  // The official mock doesn't include `useReducedMotion`; default false.
  Reanimated.useReducedMotion = () => false;
  return Reanimated;
});

// react-native-gesture-handler's jest setup registers gesture-handler
// without depending on native modules.
require('react-native-gesture-handler/jestSetup');

// Mock expo-font so useFonts returns [true] immediately in tests.
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  loadAsync: jest.fn(() => Promise.resolve()),
  isLoaded: jest.fn(() => true),
}));

global.__DEV__ = true;
