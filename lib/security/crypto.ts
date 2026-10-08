/**
 * Cryptography helpers — Web Crypto only (no Node built-ins), so the exact same
 * code runs in the browser, in Edge middleware, and in Node route handlers.
 *
 * Coverage:
 *  - `randomId()`      unguessable ids (replaces Math.random)
 *  - `sha256Hex()`     content fingerprints for the audit chain
 *  - `constantTimeEqual()`  timing-safe comparison for tokens
 *  - `EncryptionKey`   AES-GCM-256 key derivation + encrypt/decrypt
 *  - `Vault`           envelope around localStorage for at-rest encryption
 *
 * Nothing here ever logs a key, an IV, or plaintext.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Cryptographically strong random bytes.
 *
 * `Uint8Array<ArrayBuffer>` rather than a bare `Uint8Array`: the bare form
 * defaults its buffer to `ArrayBufferLike`, which every Web Crypto parameter
 * (`iv`, `salt`, `data`) rejects because they require an `ArrayBuffer`-backed
 * view. These bytes are always allocated here, so the narrower type is true.
 */
export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.getRandomValues) {
    throw new Error('Secure random source unavailable in this environment.');
  }
  webCrypto.getRandomValues(bytes);
  return bytes;
}

/** URL-safe random identifier, e.g. `cus_9f3ab21c7d45`. */
export function randomId(prefix = ''): string {
  const bytes = randomBytes(9);
  const body = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return prefix ? `${prefix}_${body}` : body;
}

/** 128-bit random token, hex encoded. Used for CSRF + request ids. */
export function randomToken(bytes = 16): string {
  return Array.from(randomBytes(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.replace(/[^0-9a-f]/gi, '');
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function utf8ToBase64(input: string): string {
  const bytes = encoder.encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToUtf8(input: string): string {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return decoder.decode(bytes);
}

/** URL-safe base64 — cookie-safe, header-safe, and never needs escaping. */
export function base64UrlEncode(input: string): string {
  return utf8ToBase64(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return base64ToUtf8(padded + pad);
}

/**
 * HMAC-SHA256 over a message, base64url encoded.
 *
 * One signing primitive shared by sessions, the plan cookie, and activation
 * codes: a second implementation is a second place to get it wrong.
 */
export async function hmacSha256Base64Url(secret: string, message: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 fingerprint of any string payload. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

/** Hash-then-compare: equal length + equal content, without early exit leaks. */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a ?? '');
  const right = encoder.encode(b ?? '');
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// AES-GCM-256
// ---------------------------------------------------------------------------

const AES_PARAMS = { name: 'AES-GCM', length: 256 } as const;

export type CipherPayload = {
  /** Schema + algorithm marker so we can rotate without breaking old blobs. */
  v: 1;
  alg: 'AES-GCM-256';
  /** base64 initialisation vector (96-bit, unique per write). */
  iv: string;
  /** base64 ciphertext + auth tag. */
  ct: string;
};

/** Derive an AES-GCM key from a passphrase-ish seed plus a per-install salt. */
export async function deriveKey(seed: string, salt: string): Promise<CryptoKey> {
  const material = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(seed),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 120_000, hash: 'SHA-256' },
    material,
    AES_PARAMS,
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptString(key: CryptoKey, plaintext: string): Promise<CipherPayload> {
  const iv = randomBytes(12);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );
  return {
    v: 1,
    alg: 'AES-GCM-256',
    iv: utf8ToBase64(String.fromCharCode(...iv)),
    ct: utf8ToBase64(String.fromCharCode(...new Uint8Array(ciphertext))),
  };
}

export async function decryptString(key: CryptoKey, payload: CipherPayload): Promise<string> {
  if (!payload || payload.v !== 1 || payload.alg !== 'AES-GCM-256') {
    throw new Error('Unsupported cipher payload.');
  }
  const iv = Uint8Array.from(base64ToUtf8(payload.iv), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(base64ToUtf8(payload.ct), (c) => c.charCodeAt(0));
  const plaintext = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return decoder.decode(plaintext);
}

// ---------------------------------------------------------------------------
// Client-side vault: encrypt what we persist, never trust raw storage
// ---------------------------------------------------------------------------

export type VaultEnvelope = CipherPayload & { createdAt: string; size: number };

export class Vault {
  private key: CryptoKey | null = null;

  constructor(
    private readonly seedSource: () => string,
    private readonly saltSource: () => string,
  ) {}

  /** Keys are derived lazily and never persisted. */
  async getKey(): Promise<CryptoKey> {
    if (!this.key) {
      this.key = await deriveKey(this.seedSource(), this.saltSource());
    }
    return this.key;
  }

  async seal(plaintext: string): Promise<VaultEnvelope> {
    const key = await this.getKey();
    const payload = await encryptString(key, plaintext);
    return { ...payload, createdAt: new Date().toISOString(), size: plaintext.length };
  }

  async open(envelope: VaultEnvelope): Promise<string> {
    const key = await this.getKey();
    return decryptString(key, envelope);
  }
}

/** Envelope shape guard used before any decrypt attempt. */
export function isVaultEnvelope(value: unknown): value is VaultEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<VaultEnvelope>;
  return candidate.v === 1 && candidate.alg === 'AES-GCM-256' && typeof candidate.iv === 'string' && typeof candidate.ct === 'string';
}
