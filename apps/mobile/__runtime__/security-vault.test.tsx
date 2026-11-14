/** Phase 20D · secure-storage fault matrix.
 *
 * These are headless JavaScript/runtime tests against a fault-injected native
 * SecureStore boundary and a durable non-secret intent journal. They are NOT
 * iOS Keychain or Android Keystore evidence. Physical-device confirmation stays
 * BLOCKED until exercised on hardware.
 */
import { SECURE_KEYS, type CompanionSession } from '@sornio/mobile-contracts';
import { createSecureStore, SECURE_STORAGE_UNAVAILABLE } from '../src/storage/secureStore';
import type { VaultIntent, VaultJournal } from '../src/storage/sessionVaultJournal';
import { persistSession, readPersistedSession, wipePersistedSession } from '../src/storage/sessionStore';
import { device, mount, pressLabel, pressTab, screen, useDevice, visibleText, waitFor } from './harness';

const mockNative = {
  values: new Map<string, string>(),
  failGet: false,
  failSet: false,
  failDelete: false,
  staleAfterDelete: false,
  async getItemAsync(key: string) { if (this.failGet) throw new Error('keychain read denied'); return this.values.get(key) ?? null; },
  async setItemAsync(key: string, value: string) { if (this.failSet) throw new Error('keychain write denied'); this.values.set(key, value); },
  async deleteItemAsync(key: string) { if (this.failDelete) throw new Error('keychain delete denied'); if (!this.staleAfterDelete) this.values.delete(key); },
};
jest.mock('expo-secure-store', () => mockNative);

function journal(initial: VaultIntent | null = null) {
  let intent = initial;
  const j: VaultJournal & { failRead?: boolean; failWrite?: boolean; corrupt?: boolean; current: () => VaultIntent | null } = {
    failRead: false, failWrite: false, corrupt: false,
    current: () => intent,
    async read() { if (this.failRead) throw new Error('journal read denied'); if (this.corrupt) return { state: 'signed-out' }; return intent; },
    async write(value) { if (this.failWrite) throw new Error('journal write denied'); intent = value; },
  };
  return j;
}
const session: CompanionSession = {
  mode: 'demo', userId: 'demo-owner', displayName: 'Demo Owner', business: { businessId: 'demo-biz', businessName: 'Demo', portalId: 'kirana' }, role: 'owner', device: { deviceId: 'device-1', displayName: 'Phone', platform: 'ios', enrollmentStatus: 'unregistered' }, accessTokenPresent: false, expiresAtIso: null,
};

beforeEach(() => { mockNative.values.clear(); mockNative.failGet = mockNative.failSet = mockNative.failDelete = mockNative.staleAfterDelete = false; });

describe('persistent operational port never falls back', () => {
  it('reads/writes/deletes through native storage', async () => { const s = createSecureStore(true); await s.set('op', 'payload'); expect(await s.get('op')).toBe('payload'); await s.delete('op'); expect(await s.get('op')).toBeNull(); expect(s.degraded()).toBe(false); });
  it.each(['get', 'set', 'delete'] as const)('throws on native %s failure instead of using memory', async op => {
    const s = createSecureStore(true);
    if (op === 'get') mockNative.failGet = true; if (op === 'set') mockNative.failSet = true; if (op === 'delete') mockNative.failDelete = true;
    await expect(op === 'get' ? s.get('op') : op === 'set' ? s.set('op', 'x') : s.delete('op')).rejects.toThrow(SECURE_STORAGE_UNAVAILABLE);
    expect(s.degraded()).toBe(false);
  });
});

describe('demo session vault fails closed across restart', () => {
  it('persists only the grant named by the journal and restores it in a new handle', async () => {
    const j = journal(); const first = createSecureStore(false, j); await persistSession(first, session); expect(j.current()?.state).toBe('active');
    const restarted = createSecureStore(false, j); expect(await readPersistedSession(restarted)).toMatchObject({ userId: 'demo-owner' });
  });
  it('ignores a legacy native session when no matching grant exists', async () => {
    mockNative.values.set(SECURE_KEYS.session, JSON.stringify(session)); const j = journal(); const s = createSecureStore(false, j); expect(await readPersistedSession(s)).toBeNull();
  });
  it('delete denial latches memory and the signed-out journal blocks a later process', async () => {
    const j = journal(); const s = createSecureStore(false, j); await persistSession(s, session); mockNative.failDelete = true;
    await wipePersistedSession(s); expect(s.degraded()).toBe(true); expect(await s.get(SECURE_KEYS.session)).toBeNull(); expect(j.current()).toEqual({ state: 'signed-out' });
    mockNative.failDelete = false; const restarted = createSecureStore(false, j); expect(await readPersistedSession(restarted)).toBeNull();
  });
  it('a delete that resolves but leaves a stale record is tombstoned and not restored', async () => {
    const j = journal(); const s = createSecureStore(false, j); await persistSession(s, session); mockNative.staleAfterDelete = true;
    await wipePersistedSession(s); expect(s.degraded()).toBe(true); expect(await s.get(SECURE_KEYS.session)).toBeNull();
    const restarted = createSecureStore(false, j); expect(await readPersistedSession(restarted)).toBeNull();
  });
  it('journal read failure never reaches the native session record', async () => {
    const j = journal({ state: 'active', grant: 'g' }); mockNative.values.set(SECURE_KEYS.session, JSON.stringify({ version: 1, grant: 'g', session: JSON.stringify(session) })); j.failRead = true;
    const s = createSecureStore(false, j); expect(await readPersistedSession(s)).toBeNull(); expect(s.degraded()).toBe(true);
  });
  it('journal write failure during sign-in keeps memory only and invalidates the native record', async () => {
    const j = journal(); j.failWrite = true; const s = createSecureStore(false, j); await persistSession(s, session); expect(s.degraded()).toBe(true); expect(await readPersistedSession(s)).toMatchObject({ userId: 'demo-owner' });
    j.failWrite = false; const restarted = createSecureStore(false, j); expect(await readPersistedSession(restarted)).toBeNull();
  });
  it('corrupt or missing intent is not permission to restore', async () => {
    const j = journal({ state: 'active', grant: 'g' }); j.corrupt = true; mockNative.values.set(SECURE_KEYS.session, JSON.stringify({ version: 1, grant: 'g', session: JSON.stringify(session) }));
    expect(await readPersistedSession(createSecureStore(false, j))).toBeNull(); expect(await readPersistedSession(createSecureStore(false, journal()))).toBeNull();
  });
  it('non-session optional records fail closed then latch to memory after a native failure', async () => {
    const s = createSecureStore(false, journal()); await s.set('draft', 'a'); mockNative.failGet = true; expect(await s.get('draft')).toBeNull(); expect(s.degraded()).toBe(true); mockNative.failGet = false; await s.set('draft', 'b'); expect(await s.get('draft')).toBe('b'); expect(mockNative.values.get('draft')).toBe('a');
  });
});

describe('sign-out UI reports unconfirmed secure removal', () => {
  beforeEach(() => useDevice(device('iPhone 16 portrait')));
  async function enterDemo() { const App = require('../App').default; await mount(<App />); await pressLabel('Other Sornio modes'); await pressLabel('Explore the companion demonstration'); await waitFor(() => expect(screen.queryAllByRole('tab').length).toBe(5), { timeout: 4000 }); }
  async function confirmSignOut() { const { Alert } = require('react-native'); const spy = jest.spyOn(Alert, 'alert').mockImplementation((...args: unknown[]) => { const buttons = args[2] as { style?: string; onPress?: () => void }[] | undefined; buttons?.find(b => b.style !== 'cancel')?.onPress?.(); }); await pressLabel('Sign out'); spy.mockRestore(); }
  it('does not claim durable removal when Keychain delete is denied', async () => {
    await enterDemo(); await pressTab('More'); mockNative.failDelete = true; await confirmSignOut();
    await waitFor(() => expect(visibleText(screen)).toContain('Signed out'));
    const text = visibleText(screen).join(' '); expect(text).toContain('encrypted device storage has not confirmed removal'); expect(text).not.toContain('This device no longer holds a Sornio session.'); expect(text).not.toContain('Sornio Demo Shop counter');
  });
});
