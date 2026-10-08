'use client';

/**
 * The counter lock — a PIN between a passer-by and the shop's books.
 *
 * In local-first mode the console lives on the shop's own device: the billing
 * tablet on the counter, the PC under the till. Whoever picks that device up
 * can read the day's takings, the udhaar khata, the customer list. That is the
 * single most obvious hole in a shop, and no amount of server-side hardening
 * closes it, because there is no server in the way.
 *
 * So the console carries its own lock: a short PIN the owner sets, hashed with
 * PBKDF2-SHA256 over a random per-install salt, and required again after the
 * counter has been idle. Locking is instant and local; unlocking is a comparison
 * in constant time. Five wrong tries and the keypad stops accepting input for a
 * while, which is what makes a 6-digit PIN worth something against a bored
 * customer rather than an attacker with an hour and a laptop.
 *
 * Stated plainly, because a lock that oversells itself is worse than none:
 *
 *   • **This protects the device, not the data from someone who owns it.** The
 *     PIN hash and salt live in the same browser storage as everything else. A
 *     determined person with the device and developer tools can overwrite the
 *     lock record and walk in. The defence against *that* is a real account —
 *     Supabase sign-in — not a PIN.
 *   • **Nothing here is biometric and nothing is sent anywhere.** No PIN ever
 *     leaves the browser; there is no recovery email, because there is no
 *     account to hang one on.
 *   • **Forgetting the PIN is not a lockout.** The honest way back in is to
 *     erase this device's local copy and start again from the synced data (or
 *     sign in), and the UI offers exactly that and says what it costs.
 *
 * Everything except the storage calls is pure, so the verifier can exercise the
 * real hashing and the real lockout arithmetic (`scripts/verify-lock.mjs`).
 */

export const LOCK_STORAGE_KEY = 'dukaanos.lock.v1';

/** Six digits: long enough to matter on a counter, short enough to use. */
export const PIN_LENGTH = 6;

/** PBKDF2 rounds. Enough to make guessing slow, small enough for a ₹6k PC. */
export const PIN_ITERATIONS = 120_000;

/** Wrong tries allowed before the keypad pauses. */
export const MAX_ATTEMPTS = 5;

/** First pause, doubled on every further failure. */
export const BASE_LOCKOUT_MS = 30_000;
export const MAX_LOCKOUT_MS = 15 * 60_000;

/** How long the counter may sit untouched before it locks itself. */
export const AUTO_LOCK_CHOICES = [1, 5, 15, 60, 0] as const; // 0 = never
export const DEFAULT_AUTO_LOCK_MINUTES = 5;

export type LockRecord = {
  version: 1;
  enabled: boolean;
  /** Random per-install salt, hex. */
  salt: string;
  /** PBKDF2-SHA256(PIN, salt, iterations), hex. Never the PIN itself. */
  hash: string;
  iterations: number;
  /** Minutes of inactivity before the console locks. 0 = never. */
  autoLockMinutes: number;
  /** Wrong tries since the last successful unlock. */
  failures: number;
  /** Epoch ms until which the keypad refuses input, or null. */
  lockedUntil: number | null;
  updatedAt: string;
};

export type LockVerdict =
  | { ok: true; record: LockRecord }
  | { ok: false; code: 'wrong' | 'locked-out' | 'invalid' | 'disabled'; error: string; record?: LockRecord };

/** PINs that are not secrets. Refused at setup, with the reason why. */
export function weakPinReason(pin: string): string | null {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return `Use exactly ${PIN_LENGTH} digits — numbers only.`;
  if (/^(\d)\1+$/.test(pin)) return 'That is one digit repeated. Anyone who watches you once has it.';
  const digits = pin.split('').map(Number);
  const ascending = digits.every((digit, index) => index === 0 || digit === digits[index - 1] + 1);
  const descending = digits.every((digit, index) => index === 0 || digit === digits[index - 1] - 1);
  if (ascending || descending) return 'That is a straight run of digits (like 123456). Pick something less guessable.';
  const common = ['112233', '121212', '123123', '654321', '000000', '111111', '123456', '102030'];
  if (common.includes(pin)) return 'That PIN is one of the first anyone tries. Choose another.';
  return null;
}

/** Minutes from a stored/selected value, clamped to a sane range. */
export function normalizeAutoLock(minutes: unknown): number {
  const value = typeof minutes === 'number' && Number.isFinite(minutes) ? Math.floor(minutes) : DEFAULT_AUTO_LOCK_MINUTES;
  if (value <= 0) return 0;
  if (value > 24 * 60) return 24 * 60;
  return value;
}

/** A locked-out keypad, or null — computed from the clock, never a timer. */
export function lockoutRemainingMs(record: LockRecord | null, now = Date.now()): number {
  if (!record?.lockedUntil) return 0;
  return Math.max(0, record.lockedUntil - now);
}

/** The pause grows with each failure: 30s, 1m, 2m, 4m… capped at 15 minutes. */
export function lockoutFor(failures: number): number {
  const steps = Math.max(0, failures - MAX_ATTEMPTS);
  return Math.min(BASE_LOCKOUT_MS * 2 ** steps, MAX_LOCKOUT_MS);
}

/** "4 minutes" / "25 seconds" — a sentence, not a countdown of milliseconds. */
export function describeWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds <= 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/* Returns an `ArrayBuffer`-backed view on purpose — see `randomBytes` in
 * lib/security/crypto.ts for why the bare `Uint8Array` is not enough. */
function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function randomSalt(bytes = 16): string {
  const buffer = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buffer);
  else for (let index = 0; index < bytes; index += 1) buffer[index] = Math.floor(Math.random() * 256);
  return toHex(buffer);
}

/**
 * PBKDF2-SHA256 over the PIN. Slow on purpose: it is the only thing standing
 * between a 6-digit secret and a list of a million guesses.
 */
export async function hashPin(pin: string, salt: string, iterations = PIN_ITERATIONS): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(salt), iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

/** Constant-time compare — a PIN check must not leak its answer through timing. */
export function equalHashes(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

function newRecord(salt: string, hash: string, autoLockMinutes: number): LockRecord {
  return {
    version: 1,
    enabled: true,
    salt,
    hash,
    iterations: PIN_ITERATIONS,
    autoLockMinutes: normalizeAutoLock(autoLockMinutes),
    failures: 0,
    lockedUntil: null,
    updatedAt: new Date().toISOString(),
  };
}

/** Set (or replace) the PIN. The PIN itself is never stored, logged, or returned. */
export async function createLockRecord(pin: string, autoLockMinutes = DEFAULT_AUTO_LOCK_MINUTES): Promise<{ ok: true; record: LockRecord } | { ok: false; error: string }> {
  const weak = weakPinReason(pin);
  if (weak) return { ok: false, error: weak };
  const salt = randomSalt();
  const hash = await hashPin(pin, salt);
  return { ok: true, record: newRecord(salt, hash, autoLockMinutes) };
}

/** Change how long the counter may sit idle. Does not touch the PIN. */
export function withAutoLock(record: LockRecord, autoLockMinutes: number): LockRecord {
  return { ...record, autoLockMinutes: normalizeAutoLock(autoLockMinutes), updatedAt: new Date().toISOString() };
}

/**
 * Check a PIN against the record, applying the lockout rules.
 *
 * A wrong PIN increments the failure count and, past the allowance, sets a
 * `lockedUntil` the caller can show. A right PIN clears both — and is only
 * accepted when the keypad is not paused, so waiting out the pause is the only
 * way through.
 */
export async function verifyPin(pin: string, record: LockRecord, now = Date.now()): Promise<LockVerdict> {
  if (!record.enabled) return { ok: false, code: 'disabled', error: 'The counter lock is not set up on this device.', record };
  const wait = lockoutRemainingMs(record, now);
  if (wait > 0) {
    return {
      ok: false,
      code: 'locked-out',
      error: `Too many wrong PINs. Try again in ${describeWait(wait)}.`,
      record,
    };
  }
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    return { ok: false, code: 'invalid', error: `Enter the ${PIN_LENGTH}-digit PIN.`, record };
  }

  const candidate = await hashPin(pin, record.salt, record.iterations);
  if (equalHashes(candidate, record.hash)) {
    return { ok: true, record: { ...record, failures: 0, lockedUntil: null, updatedAt: new Date(now).toISOString() } };
  }

  const failures = record.failures + 1;
  const paused = failures >= MAX_ATTEMPTS;
  const lockedUntil = paused ? now + lockoutFor(failures) : null;
  const remaining = Math.max(0, MAX_ATTEMPTS - failures);
  return {
    ok: false,
    code: 'wrong',
    error: paused
      ? `Wrong PIN. The keypad is paused for ${describeWait(lockoutFor(failures))} after ${failures} attempts.`
      : `Wrong PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} left before the keypad pauses.`,
    record: { ...record, failures, lockedUntil, updatedAt: new Date(now).toISOString() },
  };
}

/** Turn the lock off. Requires the current PIN, checked by the caller. */
export function disableLock(record: LockRecord): LockRecord {
  return { ...record, enabled: false, failures: 0, lockedUntil: null, updatedAt: new Date().toISOString() };
}

/** Is what we read from storage actually a lock record? Never trust storage. */
export function isLockRecord(value: unknown): value is LockRecord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LockRecord>;
  return (
    candidate.version === 1 &&
    typeof candidate.enabled === 'boolean' &&
    typeof candidate.salt === 'string' &&
    candidate.salt.length >= 16 &&
    typeof candidate.hash === 'string' &&
    candidate.hash.length === 64 &&
    typeof candidate.iterations === 'number' &&
    candidate.iterations > 0
  );
}

/**
 * Storage is best-effort: private mode, a full quota, or a locked-down browser
 * must not break the console. A failed write is reported so the UI can say the
 * lock will not survive a reload, instead of pretending it is on.
 */
export function readLockRecord(storage?: Storage | null): LockRecord | null {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store) return null;
  try {
    const raw = store.getItem(LOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isLockRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLockRecord(record: LockRecord, storage?: Storage | null): { ok: boolean; error?: string } {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store) return { ok: false, error: 'This browser will not store the lock, so it cannot be enforced.' };
  try {
    store.setItem(LOCK_STORAGE_KEY, JSON.stringify(record));
    return { ok: true };
  } catch {
    return { ok: false, error: 'The lock could not be saved on this device (storage is full or blocked).' };
  }
}

export function clearLockRecord(storage?: Storage | null): void {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store) return;
  try {
    store.removeItem(LOCK_STORAGE_KEY);
    store.removeItem(UNLOCK_FLAG_KEY);
  } catch {
    // Nothing to do: a missing lock record is the unlocked state anyway.
  }
}

/** Per-tab marker: this tab has been unlocked since it was opened. */
export const UNLOCK_FLAG_KEY = 'dukaanos.lock.open';

export function isUnlockedThisSession(storage?: Storage | null): boolean {
  const store = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : null);
  if (!store) return false;
  try {
    return store.getItem(UNLOCK_FLAG_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function markUnlocked(storage?: Storage | null): void {
  const store = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : null);
  if (!store) return;
  try {
    store.setItem(UNLOCK_FLAG_KEY, 'yes');
  } catch {
    // A tab that cannot remember being unlocked simply asks again sooner.
  }
}

export function markLocked(storage?: Storage | null): void {
  const store = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : null);
  if (!store) return;
  try {
    store.removeItem(UNLOCK_FLAG_KEY);
  } catch {
    // Ignore: the in-memory state is locked either way.
  }
}
