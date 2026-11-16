const path = require('path');

const root = __dirname;
const contracts = path.resolve(root, '../../packages/mobile-contracts/src');
const design = path.resolve(root, '../../packages/mobile-design/src');

/**
 * Headless runtime acceptance harness for the Sornio companion.
 *
 * This executes the real application components (App.tsx and everything it
 * imports) in Node. It is NOT a simulator: it proves JavaScript behaviour,
 * layout branching, navigation and state transitions, and it cannot prove
 * anything about native views, gestures, Metal rendering or iOS runtime
 * services. Simulator evidence is recorded separately.
 */
module.exports = {
  preset: 'jest-expo',
  // jest-expo's stock pattern only exempts `expo/` exactly, so packages such as
  // `expo-modules-core` stay untransformed and Node then refuses their ESM
  // builds. Dropping the trailing slash exempts the whole family by prefix.
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@testing-library))',
  ],
  setupFilesAfterEnv: [path.join(root, '__runtime__/setup.ts')],
  roots: ['<rootDir>', path.resolve(root, '../../packages')],
  // Files under ../../packages sit outside <rootDir>, so Node's upward lookup
  // never sees apps/mobile/node_modules. modulePaths restores it.
  modulePaths: [path.resolve(root, 'node_modules')],
  moduleNameMapper: {
    '^(\\.\\./)+packages/(.*)$': path.resolve(root, '../../packages') + '/$2',
    '^@sornio/mobile-contracts$': path.join(contracts, 'index.ts'),
    '^@sornio/mobile-design$': path.join(design, 'index.ts'),
  },
  testMatch: ['<rootDir>/__runtime__/**/*.test.ts?(x)'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', 'App.tsx'],
};
