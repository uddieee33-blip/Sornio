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

// Headless native boundary for the non-secret session intent marker. jest-expo
// already mocks this module (without documentDirectory); mutate that mock so a
// deliberate module reset models an app restart without erasing durable files.
// Security fault-injection tests exercise denied/corrupt journals separately.
{
  const files = new Map<string, string>();
  const fs = jest.requireMock('expo-file-system/legacy') as Record<string, unknown> & {
    documentDirectory?: string;
    getInfoAsync: jest.Mock; readAsStringAsync: jest.Mock; writeAsStringAsync: jest.Mock;
  };
  fs.documentDirectory = 'file:///sornio-headless-documents/';
  fs.getInfoAsync.mockImplementation(async (uri: string) => ({ exists: files.has(uri), isDirectory: false }));
  fs.readAsStringAsync.mockImplementation(async (uri: string) => { const value = files.get(uri); if (value === undefined) throw new Error('missing file'); return value; });
  fs.writeAsStringAsync.mockImplementation(async (uri: string, value: string) => { files.set(uri, value); });
}

// Silence the noisy deprecation banner for react-test-renderer; the renderer
// itself is only used through @testing-library/react-native.
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const first = args[0];
  if (typeof first === 'string' && first.includes('react-test-renderer is deprecated')) return;
  originalWarn(...args);
};
