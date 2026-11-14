import type { SecureStorePort } from '@sornio/mobile-contracts';
import { MemorySecureStore } from '@sornio/mobile-contracts';

/**
 * Expo SecureStore holds session records and individually bounded count drafts. Android implementations
 * historically cap values near 2 KB, so business snapshots are never written
 * here. Phase 1 does not claim encrypted offline persistence of ledgers.
 */
/**
 * `degraded()` is exposed for diagnostics only: it reports whether the native
 * store failed at least once, so a support message can say so instead of the app
 * silently behaving as if records are durable.
 */
export type SecureStoreHandle = SecureStorePort & { degraded: () => boolean };

/** A class instance cannot be spread, so the handle is built from its methods. */
function memoryHandle(): SecureStoreHandle {
  const memory = new MemorySecureStore();
  return {
    get: (key) => memory.get(key),
    set: (key, value) => memory.set(key, value),
    delete: (key) => memory.delete(key),
    degraded: () => true,
  };
}

export function createSecureStore(requirePersistent = false): SecureStoreHandle {
  let secureStore: {
    getItemAsync: (key: string) => Promise<string | null>;
    setItemAsync: (key: string, value: string) => Promise<void>;
    deleteItemAsync: (key: string) => Promise<void>;
  } | null = null;
  try {
    // Lazy require so contract tests can run without native modules.
    secureStore = require('expo-secure-store');
  } catch {
    if (requirePersistent) throw new Error('Encrypted device storage is unavailable.');
    return memoryHandle();
  }
  if (!secureStore) {
    if (requirePersistent) throw new Error('Encrypted device storage is unavailable.');
    return memoryHandle();
  }
  const native = secureStore;

  /**
   * A keychain call can fail rather than throw at require time — most notably on
   * a simulator build with code signing disabled, where there is no keychain
   * access group. That failure used to reject `bootstrap` before the session was
   * restored, so the app showed "Cannot open Sornio" instead of the workspace.
   *
   * Reads and writes now degrade to a per-process memory store, which is exactly
   * what `MemorySecureStore` exists for and what the module-missing path already
   * did. The consequence is deliberate and bounded: the session does not survive
   * an app restart when storage is unavailable. It is never silently encrypted
   * less, and `requirePersistent` still fails loudly for the callers that must
   * not lose data (the restaurant outboxes).
   */
  const fallback = new MemorySecureStore();
  let degraded = false;

  const wrap = <T,>(call: () => Promise<T>, onDegrade: () => Promise<T>) =>
    call().catch(() => {
      if (requirePersistent) throw new Error('Encrypted device storage is unavailable.');
      degraded = true;
      return onDegrade();
    });

  return {
    get: (key) => wrap(() => native.getItemAsync(key), () => fallback.get(key)),
    set: (key, value) => wrap(() => native.setItemAsync(key, value), () => fallback.set(key, value)),
    delete: (key) => wrap(() => native.deleteItemAsync(key), () => fallback.delete(key)),
    degraded: () => degraded,
  };
}
