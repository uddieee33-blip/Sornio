/**
 * Fingerprint check-in — how a gym's front desk reads a finger without ever
 * keeping one.
 *
 * The scanner a gym buys is a *fingerprint reader*, but the right way to build
 * this in a browser is WebAuthn's **platform authenticator**: the sensor in the
 * device (phone, tablet, Windows Hello laptop, or a USB reader the OS already
 * knows how to talk to) verifies the finger in hardware, and hands the page
 * back only a credential id. DukaanOS stores that id.
 *
 * What that means, stated plainly — this is also what the Trust Centre shows:
 *
 *   • **No fingerprint is captured.** Not an image, not a template, not a hash
 *     of one. The API does not expose one, so there is nothing to store, leak,
 *     or hand over.
 *   • **The finger never leaves the device.** Matching happens in the sensor.
 *   • **Forgetting is deleting.** Revoking a credential deletes one row; there
 *     is no biometric record anywhere else to chase.
 *   • **A fingerprint is not a password.** It identifies the member at the desk
 *     — it can never move money, and it is checked with user verification
 *     required, so the member (or the desk, for them) has to be present to use it.
 *
 * Honest limits, which the UI repeats rather than hides:
 *   • On a desktop without a reader, there is no fingerprint to take. The desk
 *     falls back to the member's phone number, and the console says why.
 *   • WebAuthn reports "cancelled" and "finger did not match" with the *same*
 *     error (`NotAllowedError`). The UI must not claim to know which happened.
 */

import { isEmbedded, platformAuthenticatorAvailable } from './device';

export type FingerprintFailure =
  | 'unsupported'
  | 'cancelled'
  | 'timeout'
  | 'duplicate'
  | 'failed';

export type FingerprintResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: FingerprintFailure; error: string };

/** 32 bytes of randomness, per the WebAuthn guidance for a challenge. */
function randomChallenge(bytes = 32): Uint8Array {
  const buffer = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buffer);
  else for (let index = 0; index < bytes; index += 1) buffer[index] = Math.floor(Math.random() * 256);
  return buffer;
}

export function toBase64Url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isBrowserAuthAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials?.create === 'function' &&
    typeof window.PublicKeyCredential !== 'undefined'
  );
}

/** Map the browser's terse DOM errors onto sentences the desk can act on. */
function interpretError(error: unknown): FingerprintResult<never> {
  const name = error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
      return {
        ok: false,
        code: 'cancelled',
        error:
          'The finger was not verified — the member cancelled, or the finger did not match (the browser reports both the same way). Try again, or check the member in from the name list.',
      };
    case 'SecurityError':
      return { ok: false, code: 'unsupported', error: 'Fingerprint check-in needs HTTPS (or localhost).' };
    case 'NotSupportedError':
      return { ok: false, code: 'unsupported', error: 'This device has no fingerprint sensor available to the browser.' };
    case 'InvalidStateError':
      return {
        ok: false,
        code: 'duplicate',
        error: 'This finger is already enrolled on this device. Check the member in with it instead.',
      };
    case 'TimeoutError':
    case 'AbortError':
      return { ok: false, code: 'timeout', error: 'The fingerprint reader timed out. Ask the member to try again.' };
    default:
      return {
        ok: false,
        code: 'failed',
        error: error instanceof Error && error.message ? error.message : 'The fingerprint reader could not be used.',
      };
  }
}

export async function isFingerprintAvailable(): Promise<boolean> {
  try {
    return await platformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Enrol a member's finger on *this* device.
 *
 * `excludeCredentials` carries every credential already enrolled here, so the
 * platform refuses a re-enrolment of the same sensor rather than silently
 * issuing a second id for the same finger.
 */
export type AuthenticatorAttachment = 'platform' | 'cross-platform' | 'any';

export async function enrollFingerprint(input: {
  memberId: string;
  memberName: string;
  /** Shown by the platform prompt, so the member knows which app is asking. */
  businessName: string;
  excludeCredentialIds?: string[];
  /**
   * Which reader to use.
   *
   * `platform` is the sensor built into the device — a phone, a tablet, a
   * Windows Hello laptop. That is what a front desk should use.
   *
   * `cross-platform` is a *separate* reader: a USB/NFC security key, or the USB
   * fingerprint readers that present themselves to the OS as an authenticator.
   * Shops do buy these, and refusing to talk to one because it is not built in
   * would be a limitation of ours, not of their hardware.
   *
   * `any` lets the browser offer whatever it has, including the phone-as-key
   * flows. Kept explicit rather than the default, because a desk that silently
   * demanded a phone would be a worse front desk.
   */
  attachment?: AuthenticatorAttachment;
}): Promise<FingerprintResult<{ credentialId: string; label: string }>> {
  const attachment = input.attachment ?? 'platform';
  if (!isBrowserAuthAvailable()) {
    return { ok: false, code: 'unsupported', error: 'This browser cannot talk to a fingerprint sensor.' };
  }
  // Only the built-in sensor can be checked in advance. An external reader is
  // discovered by the ceremony itself (`getClientCapabilities` is not shipped
  // everywhere yet), so for those we let the browser answer.
  if (attachment === 'platform' && !(await isFingerprintAvailable())) {
    return {
      ok: false,
      code: 'unsupported',
      error:
        'This device has no fingerprint sensor of its own. Plug in your USB reader or security key and choose “Use a plugged-in reader”, or enrol the member from the tablet or phone that has a sensor.',
    };
  }

  // WebAuthn binds credentials to an origin. A preview frame, a webview and a
  // real tab are different origins, so the enrolment must happen where the desk
  // will actually use it — said out loud instead of failing obscurely later.
  if (isEmbedded()) {
    return {
      ok: false,
      code: 'unsupported',
      error:
        'This page is inside another app’s frame, so the fingerprint would be bound to that frame and would not work at your counter. Open DukaanOS in its own tab and enrol there.',
    };
  }

  const rpId = window.location.hostname;
  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { id: rpId, name: 'DukaanOS' },
        user: {
          // The member's own id, so a re-enrolment on a new device is still the
          // same person. It is an id, never a name or a phone number.
          id: new TextEncoder().encode(input.memberId),
          name: input.memberName,
          displayName: `${input.memberName} · ${input.businessName}`,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          ...(attachment === 'any' ? {} : { authenticatorAttachment: attachment }),
          userVerification: 'required',
          residentKey: 'preferred',
        },
        attestation: 'none',
        timeout: 60_000,
        excludeCredentials: (input.excludeCredentialIds ?? []).map((id) => ({
          type: 'public-key',
          id: fromBase64Url(id),
        })),
      },
    })) as PublicKeyCredential | null;

    if (!credential) {
      return { ok: false, code: 'cancelled', error: 'Enrolment was cancelled.' };
    }
    return {
      ok: true,
      data: {
        credentialId: toBase64Url(credential.rawId),
        label: `${describeDevice()} · enrolled ${new Date().toLocaleDateString('en-IN')}`,
      },
    };
  } catch (error) {
    return interpretError(error);
  }
}

/**
 * Verify a finger at the desk and tell the caller *which* credential was used.
 *
 * Passing `allowCredentialIds` keeps the prompt scoped to members enrolled on
 * this device — the sensor verifies, and the returned credential id is the only
 * thing that says who it was.
 */
export async function verifyFingerprint(input: {
  allowCredentialIds: string[];
  /** Skip the platform UI entirely when nobody is enrolled here yet. */
}): Promise<FingerprintResult<{ credentialId: string }>> {
  if (!isBrowserAuthAvailable()) {
    return { ok: false, code: 'unsupported', error: 'This browser cannot talk to a fingerprint sensor.' };
  }
  if (input.allowCredentialIds.length === 0) {
    return {
      ok: false,
      code: 'unsupported',
      error: 'Nobody is enrolled on this device yet. Enrol a member’s finger first — it takes one press.',
    };
  }

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        rpId: window.location.hostname,
        allowCredentials: input.allowCredentialIds.map((id) => ({
          type: 'public-key',
          id: fromBase64Url(id),
        })),
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) return { ok: false, code: 'cancelled', error: 'Nothing was verified.' };
    return { ok: true, data: { credentialId: toBase64Url(assertion.rawId) } };
  } catch (error) {
    return interpretError(error);
  }
}

/** A readable device name for the credential label, without fingerprinting the browser. */
export function describeDevice(): string {
  if (typeof navigator === 'undefined') return 'this device';
  const platform = navigator.platform || '';
  const touch = typeof window !== 'undefined' && 'ontouchstart' in window;
  if (/Mac/i.test(platform)) return 'Mac (Touch ID)';
  if (/Win/i.test(platform)) return 'Windows Hello device';
  if (/Linux|Android/i.test(platform) || touch) return 'Android device';
  if (/iPhone|iPad|iPod/i.test(platform)) return 'iPhone / iPad';
  return 'this device';
}
