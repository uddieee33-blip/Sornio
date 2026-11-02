import type { SecureStorePort } from '@sornio/mobile-contracts';
import { MemorySecureStore } from '@sornio/mobile-contracts';

/**
 * Expo SecureStore is used for session records only. Android implementations
 * historically cap values near 2 KB, so business snapshots are never written
 * here. Phase 1 does not claim encrypted offline persistence of ledgers.
 */
export function createSecureStore(): SecureStorePort {
  try {
    // Lazy require so contract tests can run without native modules.
    const SecureStore = require('expo-secure-store') as {
      getItemAsync: (key: string) => Promise<string | null>;
      setItemAsync: (key: string, value: string) => Promise<void>;
      deleteItemAsync: (key: string) => Promise<void>;
    };
    return {
      get: (key) => SecureStore.getItemAsync(key),
      set: (key, value) => SecureStore.setItemAsync(key, value),
      delete: (key) => SecureStore.deleteItemAsync(key),
    };
  } catch {
    return new MemorySecureStore();
  }
}
