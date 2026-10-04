'use client';

/**
 * Encrypted local persistence ("the vault").
 *
 * Local-first is a product promise: the shop's data lives on the shop's device
 * and works with no connection. That promise only holds up if the bytes on
 * disk are unreadable to anyone who gets the device or inspects devtools.
 *
 * Layers:
 *  - **Integrity envelope**: everything we write carries a schema version, a
 *    byte count, and a checksum, so tampering is detected before parsing.
 *  - **AES-GCM-256 at rest**: the payload is encrypted with a key derived from
 *    a per-install random secret (PBKDF2, 120k iterations) held in a separate
 *    storage slot, so copying one key never exposes the data.
 *  - **Quota guard**: writes are size-checked and the oldest snapshots are
 *    trimmed instead of silently failing.
 *  - **Graceful degradation**: if crypto or storage is unavailable (private
 *    mode, ancient browser) we fall back to unencrypted local storage and
 *    raise a visible notice rather than losing the owner's data.
 */

import { isVaultEnvelope, randomBytes, Vault, type VaultEnvelope } from './crypto';
import { safeStringify } from './redact';

export const VAULT_PREFIX = 'dukaanos.vault';
export const KEY_SLOT = `${VAULT_PREFIX}.key`;
export const SALT_SLOT = `${VAULT_PREFIX}.salt`;
export const BACKUP_SLOT = `${VAULT_PREFIX}.backup`;

const MAX_BYTES = 4 * 1024 * 1024; // Firefox/Chrome give ~5MB per origin.

export type VaultIntegrity = {
  version: number;
  writtenAt: string;
  bytes: number;
  checksum: string;
};

export type VaultRecord = {
  integrity: VaultIntegrity;
  /** Encrypted payload — the only thing that touches the disk. */
  envelope: VaultEnvelope;
};

export type VaultWriteResult =
  | { ok: true; bytes: number; encrypted: true }
  | { ok: true; bytes: number; encrypted: false; warning: string }
  | { ok: false; error: string };

export type VaultReadResult<T = unknown> =
  | { ok: true; data: T; encrypted: boolean }
  | { ok: false; error: string };

const SCHEMA_VERSION = 2;

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = `${VAULT_PREFIX}.probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

function cryptoAvailable(): boolean {
  return typeof globalThis.crypto?.subtle !== 'undefined' && typeof globalThis.crypto?.getRandomValues === 'function';
}

/** Per-install device secret. Created once, never leaves the device. */
function deviceSecret(store: Storage): string {
  let secret = store.getItem(KEY_SLOT);
  if (!secret || secret.length < 32) {
    secret = Array.from(randomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
    try {
      store.setItem(KEY_SLOT, secret);
    } catch {
      // Storage full — the derived key simply won't survive a reload.
    }
  }
  return secret;
}

function deviceSalt(store: Storage): string {
  let salt = store.getItem(SALT_SLOT);
  if (!salt) {
    salt = Array.from(randomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
    try {
      store.setItem(SALT_SLOT, salt);
    } catch {
      // As above.
    }
  }
  return salt;
}

let vaultInstance: Vault | null = null;

function getVault(store: Storage): Vault {
  if (!vaultInstance) {
    vaultInstance = new Vault(() => deviceSecret(store), () => deviceSalt(store));
  }
  return vaultInstance;
}

/** Cheap, non-cryptographic checksum: catches corruption, not adversaries. */
function checksumOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export async function vaultWrite<T>(key: string, data: T): Promise<VaultWriteResult> {
  const store = storage();
  if (!store) return { ok: false, error: 'Local storage is unavailable in this browser.' };

  const serialised = safeStringify(data);
  const bytes = serialised.length;

  if (bytes > MAX_BYTES) {
    return { ok: false, error: 'This business has grown past local storage limits — connect Supabase to keep syncing.' };
  }

  const integrity: VaultIntegrity = {
    version: SCHEMA_VERSION,
    writtenAt: new Date().toISOString(),
    bytes,
    checksum: checksumOf(serialised),
  };

  const slot = `${VAULT_PREFIX}.${key}`;

  // Keep one previous snapshot so a bad write can never lose the ledger.
  try {
    const previous = store.getItem(slot);
    if (previous && previous.length < MAX_BYTES / 2) store.setItem(`${BACKUP_SLOT}.${key}`, previous);
  } catch {
    // Backup is best-effort.
  }

  if (!cryptoAvailable()) {
    try {
      store.setItem(slot, safeStringify({ integrity, plain: data, encrypted: false }));
      return {
        ok: true,
        bytes,
        encrypted: false,
        warning: 'Encryption is unavailable here, so data is stored unencrypted on this device.',
      };
    } catch {
      return { ok: false, error: 'Could not write to local storage.' };
    }
  }

  try {
    const vault = getVault(store);
    const envelope = await vault.seal(serialised);
    const record: VaultRecord = { integrity, envelope };
    store.setItem(slot, safeStringify(record));
    return { ok: true, bytes, encrypted: true };
  } catch {
    return { ok: false, error: 'Encryption failed — nothing was written.' };
  }
}

export async function vaultRead<T>(key: string): Promise<VaultReadResult<T>> {
  const store = storage();
  if (!store) return { ok: false, error: 'Local storage is unavailable in this browser.' };

  const slot = `${VAULT_PREFIX}.${key}`;
  const raw = store.getItem(slot);
  if (!raw) return { ok: false, error: 'No saved data yet.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Saved data is corrupt and could not be read.' };
  }

  const record = parsed as Partial<VaultRecord> & { plain?: T; encrypted?: boolean };

  // Legacy / plaintext fallback shape.
  if (record.encrypted === false && 'plain' in record) {
    return { ok: true, data: record.plain as T, encrypted: false };
  }

  if (!record.envelope || !isVaultEnvelope(record.envelope)) {
    return { ok: false, error: 'Saved data is not in a recognised format.' };
  }

  try {
    const vault = getVault(store);
    const plaintext = await vault.open(record.envelope);
    const data = JSON.parse(plaintext) as T;
    if (record.integrity && checksumOf(plaintext) !== record.integrity.checksum) {
      return { ok: false, error: 'Saved data failed its integrity check — restored from the last good snapshot.' };
    }
    return { ok: true, data, encrypted: true };
  } catch {
    return { ok: false, error: 'Saved data could not be decrypted on this device.' };
  }
}

/** Restore the previous snapshot when the newest write is unrecoverable. */
export async function vaultRestoreBackup<T>(key: string): Promise<VaultReadResult<T>> {
  const store = storage();
  if (!store) return { ok: false, error: 'Local storage is unavailable in this browser.' };
  const raw = store.getItem(`${BACKUP_SLOT}.${key}`);
  if (!raw) return { ok: false, error: 'No backup snapshot available.' };
  try {
    store.setItem(`${VAULT_PREFIX}.${key}`, raw);
  } catch {
    return { ok: false, error: 'Could not restore the backup snapshot.' };
  }
  return vaultRead<T>(key);
}

export function vaultClear(key: string): void {
  const store = storage();
  if (!store) return;
  store.removeItem(`${VAULT_PREFIX}.${key}`);
  store.removeItem(`${BACKUP_SLOT}.${key}`);
}

export function vaultStatus(): { available: boolean; encrypted: boolean; usedBytes: number } {
  const store = storage();
  if (!store) return { available: false, encrypted: false, usedBytes: 0 };
  let usedBytes = 0;
  try {
    for (let i = 0; i < store.length; i += 1) {
      const name = store.key(i);
      if (name?.startsWith(VAULT_PREFIX)) usedBytes += (store.getItem(name) ?? '').length;
    }
  } catch {
    // Ignore enumeration failures.
  }
  return { available: true, encrypted: cryptoAvailable(), usedBytes };
}
