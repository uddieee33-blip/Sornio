import * as Crypto from 'expo-crypto';
import { SECURE_KEYS, type SecureStorePort } from '@sornio/mobile-contracts';
import { MemorySecureStore } from '@sornio/mobile-contracts';
import { defaultVaultJournal, type VaultJournal } from './sessionVaultJournal';

/**
 * Expo SecureStore holds session records and individually bounded count drafts.
 * `requirePersistent` is mandatory for restaurant outboxes: those callers never
 * receive a volatile fallback. The non-persistent demo session may use memory
 * only after a *latched* failure. A separate non-secret journal names the one
 * vault grant that may be restored, so a stale native record cannot silently
 * authenticate a later process after a denied Keychain delete.
 */
export type SecureStoreHandle = SecureStorePort & { degraded: () => boolean };
export const SECURE_STORAGE_UNAVAILABLE = 'Encrypted device storage is unavailable.';
export const SECURE_DELETION_UNCONFIRMED = 'Secure sign-out could not be confirmed on this device. The session is locked here; resolve device storage before trusting automatic sign-in again.';

function memoryHandle(): SecureStoreHandle {
  const memory = new MemorySecureStore();
  return {
    get: (key) => memory.get(key),
    set: (key, value) => memory.set(key, value),
    delete: (key) => memory.delete(key),
    degraded: () => true,
  };
}

type NativeStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};
function newGrant(): string {
  // Expo's synchronous UUID in production; a non-secret unique fallback keeps
  // headless runtimes (whose native mocks may be async/no-op) fail-closed too.
  try { const value = Crypto.randomUUID(); if (typeof value === 'string' && value.length > 0) return value; } catch { /* fall through */ }
  return `vault-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
function envelope(grant: string, session: string) { return JSON.stringify({ version: 1, grant, session }); }
function opened(raw: string | null, grant: string): string | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === 'object' && value !== null && 'version' in value && value.version === 1 && 'grant' in value && value.grant === grant && 'session' in value && typeof value.session === 'string') return value.session;
  } catch { /* legacy or tombstoned records are not resumable */ }
  return null;
}

export function createSecureStore(requirePersistent = false, journal?: VaultJournal | null): SecureStoreHandle {
  let secureStore: NativeStore | null = null;
  try { secureStore = require('expo-secure-store'); } catch {
    if (requirePersistent) throw new Error(SECURE_STORAGE_UNAVAILABLE);
    return memoryHandle();
  }
  if (!secureStore) {
    if (requirePersistent) throw new Error(SECURE_STORAGE_UNAVAILABLE);
    return memoryHandle();
  }
  const native = secureStore;
  const fallback = new MemorySecureStore();
  const vault = journal === undefined ? defaultVaultJournal() : journal;
  let degraded = false;
  const degrade = () => { degraded = true; };
  const isSession = (key: string) => key === SECURE_KEYS.session;
  const invalidate = async (key: string) => {
    // Best effort: a non-envelope value cannot satisfy any active grant even if
    // the journal itself is temporarily unwritable.
    try { await native.setItemAsync(key, 'signed-out'); } catch { /* fail closed */ }
  };

  return {
    async get(key) {
      if (requirePersistent) {
        try { return await native.getItemAsync(key); } catch { throw new Error(SECURE_STORAGE_UNAVAILABLE); }
      }
      if (degraded) return fallback.get(key);
      if (isSession(key)) {
        if (!vault) return fallback.get(key);
        try {
          const intent = await vault.read();
          if (intent?.state !== 'active') return fallback.get(key);
          return opened(await native.getItemAsync(key), intent.grant) ?? fallback.get(key);
        } catch { degrade(); return fallback.get(key); }
      }
      try { return await native.getItemAsync(key); } catch { degrade(); return fallback.get(key); }
    },
    async set(key, value) {
      if (requirePersistent) {
        try { await native.setItemAsync(key, value); } catch { throw new Error(SECURE_STORAGE_UNAVAILABLE); }
        return;
      }
      if (degraded) return fallback.set(key, value);
      if (isSession(key)) {
        if (!vault) { degrade(); return fallback.set(key, value); }
        try {
          const grant = newGrant();
          await vault.write({ state: 'active', grant });
          await native.setItemAsync(key, envelope(grant, value));
        } catch {
          degrade();
          try { await vault.write({ state: 'signed-out' }); } catch { /* best effort */ }
          await invalidate(key);
          return fallback.set(key, value);
        }
        return;
      }
      try { await native.setItemAsync(key, value); } catch { degrade(); return fallback.set(key, value); }
    },
    async delete(key) {
      if (requirePersistent) {
        try { await native.deleteItemAsync(key); } catch { throw new Error(SECURE_STORAGE_UNAVAILABLE); }
        return;
      }
      if (degraded) return fallback.delete(key);
      if (isSession(key)) {
        try {
          if (vault) await vault.write({ state: 'signed-out' });
          await native.deleteItemAsync(key);
          if ((await native.getItemAsync(key)) != null) throw new Error('native record survived deletion');
          await fallback.delete(key);
        } catch {
          degrade();
          await invalidate(key);
          await fallback.delete(key);
        }
        return;
      }
      try { await native.deleteItemAsync(key); } catch { degrade(); await fallback.delete(key); }
    },
    degraded: () => degraded,
  };
}
