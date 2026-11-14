import { SECURE_KEYS, type SecureStorePort } from '@sornio/mobile-contracts';
import { MemorySecureStore } from '@sornio/mobile-contracts';
import { defaultVaultJournal, type VaultJournal } from './sessionVaultJournal';

/**
 * Expo SecureStore holds session records and individually bounded count drafts.
 * `requirePersistent` is mandatory for restaurant outboxes: those callers never
 * receive a volatile fallback. The non-persistent demo session may use memory
 * only after a *latched* failure, and a separate non-secret journal prevents a
 * stale native session from silently authenticating the next process.
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

export function createSecureStore(requirePersistent = false, journal?: VaultJournal | null): SecureStoreHandle {
  let secureStore: {
    getItemAsync: (key: string) => Promise<string | null>;
    setItemAsync: (key: string, value: string) => Promise<void>;
    deleteItemAsync: (key: string) => Promise<void>;
  } | null = null;
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

  return {
    async get(key) {
      if (requirePersistent) {
        try { return await native.getItemAsync(key); } catch { throw new Error(SECURE_STORAGE_UNAVAILABLE); }
      }
      if (degraded) return fallback.get(key);
      if (isSession(key)) {
        // Missing intent is deliberately not treated as an resumable session.
        // This also makes the first bootstrap after an upgrade fail closed.
        try { if (!vault || await vault.read() !== 'active') return fallback.get(key); }
        catch { degrade(); return fallback.get(key); }
      }
      try { return await native.getItemAsync(key); } catch { degrade(); return fallback.get(key); }
    },
    async set(key, value) {
      if (requirePersistent) {
        try { await native.setItemAsync(key, value); } catch { throw new Error(SECURE_STORAGE_UNAVAILABLE); }
        return;
      }
      if (degraded) return fallback.set(key, value);
      if (isSession(key) && !vault) { degrade(); return fallback.set(key, value); }
      try {
        await native.setItemAsync(key, value);
        if (isSession(key)) await vault!.write('active');
      } catch {
        // Never alternate native and memory reads after a partial failure.
        degrade();
        return fallback.set(key, value);
      }
    },
    async delete(key) {
      if (requirePersistent) {
        try { await native.deleteItemAsync(key); } catch { throw new Error(SECURE_STORAGE_UNAVAILABLE); }
        return;
      }
      if (degraded) return fallback.delete(key);
      let intentDurable = false;
      try {
        if (isSession(key) && vault) { await vault.write('signed-out'); intentDurable = true; }
        await native.deleteItemAsync(key);
        // A resolved delete is not enough if the native record is still readable.
        if (await native.getItemAsync(key) !== null) throw new Error('native record survived deletion');
        await fallback.delete(key);
        if (isSession(key) && !intentDurable) degrade();
      } catch {
        // The caller can inspect degraded() and must not describe this as durable
        // removal. All later reads on this handle are latched to memory, so the
        // stale native record cannot resurrect the session in this process.
        degrade();
        if (isSession(key)) {
          // Some Keychain ACL failures deny delete but still permit replacement.
          // A non-secret, non-session value is a best-effort durable tombstone;
          // it is never parsed as a credential. If this also fails, the journal
          // remains the restart defence and the UI reports degraded storage.
          try { await native.setItemAsync(key, 'signed-out'); } catch { /* fail closed */ }
        }
        await fallback.delete(key);
      }
    },
    degraded: () => degraded,
  };
}
