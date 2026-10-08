'use client';

/**
 * Passkey unlock for the counter.
 *
 * The counter lock already works: a 6-digit PIN, PBKDF2-hashed, with a
 * doubling lockout. The problem with a PIN on a shop counter is not the
 * cryptography, it is the physics — the owner types it in front of whoever is
 * standing at the till, forty times a day, and after a week the person who
 * buys milk every morning knows it.
 *
 * A passkey fixes exactly that and nothing else. The device's own sensor
 * matches the finger or the face **in hardware**, and the browser hands back a
 * signed assertion. There is nothing to watch, nothing to type, nothing to
 * shoulder-surf.
 *
 * What DukaanOS stores, in full: **a credential id**. Not a fingerprint, not a
 * template, not a hash of one, not a public key we could ever be compelled to
 * turn into a biometric. The same discipline the gym check-in kiosk already
 * follows (`lib/scanning/fingerprint.ts`) — because a shop that is breached
 * should lose its sales figures, never its customers' fingers.
 *
 * Three honest limits, stated here because a lock that oversells itself is
 * worse than no lock:
 *
 *   1. **It is a second door to the same room, not a stronger room.** The PIN
 *      still works, by design: a passkey bound to a dead tablet must never be
 *      the only way into a business's books.
 *   2. **It is bound to this origin and this device.** That is the security
 *      property, and it is also the limitation — enrolling on the till does
 *      not enrol the owner's phone.
 *   3. **It protects the device, not the data from someone who owns it.** Like
 *      the PIN. The local vault is still readable by anyone holding an
 *      unlocked machine with developer tools. The defence against *that* is a
 *      real account, not a credential id.
 */

export const PASSKEY_STORAGE_KEY = 'dukaanos.passkey.v1';

export type PasskeyRecord = {
  version: 1;
  /** Base64url credential id. The only thing stored, ever. */
  credentialId: string;
  /** What the owner called this device, for the "forget" list. */
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type PasskeyResult<T = void> = { ok: true; value: T } | { ok: false; error: string };

/* ------------------------------------------------------------------ support */

export type PasskeySupport =
  | { available: true }
  | { available: false; reason: string };

/**
 * Can this browser do it, here, now?
 *
 * Each refusal names the actual cause, because "passkeys are not available"
 * sends an owner to a support call while "this page is inside a frame" sends
 * them to a button. A credential is bound to an origin, and the origin inside
 * a preview frame is not the counter — so enrolment refuses in a frame rather
 * than minting a credential that will not work tomorrow.
 */
export function passkeySupport(): PasskeySupport {
  if (typeof window === 'undefined') return { available: false, reason: 'Not in a browser.' };
  if (!('PublicKeyCredential' in window)) {
    return { available: false, reason: 'This browser has no passkey support. The PIN still works.' };
  }
  if (!window.isSecureContext) {
    return { available: false, reason: 'Passkeys need an HTTPS connection. The PIN still works.' };
  }
  if (window.top !== window.self) {
    return {
      available: false,
      reason: 'This page is inside a frame, and a passkey is bound to the page it was created on. Open DukaanOS in its own tab to enrol one.',
    };
  }
  return { available: true };
}

/** Does this device have a built-in sensor (fingerprint, face) it can use? */
export async function hasPlatformAuthenticator(): Promise<boolean> {
  const support = passkeySupport();
  if (!support.available) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ storage */

export function readPasskey(): PasskeyRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PASSKEY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PasskeyRecord;
    if (parsed?.version !== 1 || typeof parsed.credentialId !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePasskey(record: PasskeyRecord | null) {
  try {
    if (record === null) window.localStorage.removeItem(PASSKEY_STORAGE_KEY);
    else window.localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* a locked-down browser must not break the lock */
  }
  publishPasskey(record);
}

/* -------------------------------------------------------------------- store */

/**
 * The enrolment, as an external store.
 *
 * Two very different screens need to know whether a passkey exists — the lock
 * screen, to decide whether to offer the sensor, and the Trust Centre, to
 * score it — and they are never mounted together. Reading `localStorage` in a
 * mount effect would work, but it renders each of them once with the wrong
 * answer first; on the lock screen that is a bypass button that flickers into
 * existence, which looks exactly like the thing you do not want a lock screen
 * to look like.
 *
 * The snapshot is cached because `useSyncExternalStore` compares by identity:
 * parsing the JSON afresh on every render would hand React a new object each
 * time and spin.
 */
let passkeyCache: PasskeyRecord | null | undefined;
const passkeyListeners = new Set<() => void>();

export function passkeySnapshot(): PasskeyRecord | null {
  if (passkeyCache === undefined) passkeyCache = readPasskey();
  return passkeyCache;
}

/** No device on the server, so no passkey. Matches the first client render. */
export const passkeyServerSnapshot = (): PasskeyRecord | null => null;

export function subscribePasskey(listener: () => void) {
  passkeyListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== PASSKEY_STORAGE_KEY) return;
    passkeyCache = undefined;
    for (const notify of passkeyListeners) notify();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    passkeyListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function publishPasskey(record: PasskeyRecord | null) {
  passkeyCache = record;
  for (const listener of passkeyListeners) listener();
}

/* -------------------------------------------------------------------- bytes */

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* `ArrayBuffer`-backed, not a bare `Uint8Array`: WebAuthn only accepts a
 * `BufferSource`, and the bare form widens to `ArrayBufferLike`. */
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomChallenge(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

/* ------------------------------------------------------------------ enrol */

/**
 * Enrol this device.
 *
 * The challenge is generated locally and is deliberately **not** verified
 * server-side, because in local-first mode there is no server holding anything
 * to verify against. That is stated rather than hidden: this is a device
 * unlock, equivalent in trust to the PIN it sits beside, not a remote
 * authentication. When a deployment has real accounts, sign-in is Supabase's
 * job and this never becomes the thing standing between a stranger and a
 * business's data.
 */
export async function enrollPasskey(label: string): Promise<PasskeyResult<PasskeyRecord>> {
  const support = passkeySupport();
  if (!support.available) return { ok: false, error: support.reason };

  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: 'DukaanOS', id: window.location.hostname },
        user: {
          // Not a person. A per-install handle, so the credential is scoped to
          // this console rather than to an identity we do not have.
          id: randomChallenge().slice(0, 16),
          name: 'counter',
          displayName: label.slice(0, 40) || 'This counter',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          // The sensor in the tablet on the counter is the whole point.
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        // Nothing is sent anywhere, so there is nothing to attest to.
        attestation: 'none',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) return { ok: false, error: 'No passkey was created.' };

    const record: PasskeyRecord = {
      version: 1,
      credentialId: toBase64Url(credential.rawId),
      label: label.slice(0, 40) || 'This counter',
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };
    writePasskey(record);
    return { ok: true, value: record };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

/* ----------------------------------------------------------------- unlock */

/** Ask the device to confirm the person at the counter. */
export async function verifyPasskey(): Promise<PasskeyResult> {
  const support = passkeySupport();
  if (!support.available) return { ok: false, error: support.reason };

  const record = readPasskey();
  if (!record) return { ok: false, error: 'No passkey is enrolled on this device.' };

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        // Only the credential this console enrolled. Without this the browser
        // would offer every passkey on the device for this origin.
        allowCredentials: [{ type: 'public-key', id: fromBase64Url(record.credentialId) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) return { ok: false, error: 'The device did not confirm.' };
    if (toBase64Url(assertion.rawId) !== record.credentialId) {
      return { ok: false, error: 'A different passkey answered. Use the PIN.' };
    }

    writePasskey({ ...record, lastUsedAt: new Date().toISOString() });
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

/** Remove the passkey from this device. The PIN is unaffected. */
export function forgetPasskey(): void {
  writePasskey(null);
}

/** Turn a DOMException into something an owner can act on. */
function describe(error: unknown): string {
  const name = (error as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError') return 'Cancelled, or the sensor did not match. Use the PIN instead.';
  if (name === 'InvalidStateError') return 'This device already has a passkey for DukaanOS.';
  if (name === 'NotSupportedError') return 'This device has no sensor DukaanOS can use. The PIN still works.';
  if (name === 'SecurityError') return 'The browser refused — passkeys need HTTPS and an unframed page.';
  if (name === 'AbortError') return 'Timed out waiting for the sensor.';
  return 'The device could not complete that. The PIN still works.';
}
