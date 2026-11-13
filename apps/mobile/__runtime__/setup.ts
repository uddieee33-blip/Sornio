/**
 * Runtime acceptance harness setup.
 *
 * Nothing here changes product behaviour. Each entry bridges a gap between a
 * native iOS/Android runtime and Node, so the *real* application components can
 * be mounted and driven headlessly:
 *
 * - jest-expo's stock transform pattern leaves most ESM Expo packages
 *   untransformed; `jest.config.js` widens it instead of mocking them away.
 * - `react-native-safe-area-context` renders through a native view that emits
 *   nothing under test, so its own published Jest mock is used.
 */
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context/jest/mock');
  return typeof actual === 'object' && 'default' in actual ? actual.default : actual;
});

// Silence the noisy deprecation banner for react-test-renderer; the renderer
// itself is only used through @testing-library/react-native.
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const first = args[0];
  if (typeof first === 'string' && first.includes('react-test-renderer is deprecated')) return;
  originalWarn(...args);
};
