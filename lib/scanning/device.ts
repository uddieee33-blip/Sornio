/**
 * Capture devices — what this device can actually do.
 *
 * A shop counter is not a controlled environment: it might be an Android phone
 * with a camera, a ₹6,000 Windows billing PC with a USB laser scanner, or a
 * front-desk tablet with a fingerprint reader. Rather than pretend every device
 * can do everything, DukaanOS asks the device, reports honestly, and always
 * leaves a way to work:
 *
 *   • **Hardware scanner (keyboard wedge)** — every device has one, because a
 *     USB/Bluetooth scanner is just a keyboard that types very fast. This is the
 *     channel most Indian shops already own, so it is never "unsupported".
 *   • **Camera** — needs HTTPS (a secure context) and a camera.
 *   • **On-device decoding** — the browser's own `BarcodeDetector`. Where it
 *     exists, no image ever leaves the phone; where it does not, the counter
 *     falls back to the wedge and typed entry rather than sending frames to a
 *     server. DukaanOS has no server-side image pipeline at all.
 *   • **Fingerprint** — a platform authenticator through WebAuthn. A desktop PC
 *     with no reader reports unavailable, and the front desk keeps working on
 *     phone lookup.
 *
 * Every function here is browser-only and safe to call before render: nothing
 * touches `navigator` until it is called, and every failure is reported as a
 * reason string rather than thrown.
 */

import type { CaptureReadiness } from './types';

const hasWindow = () => typeof window !== 'undefined' && typeof navigator !== 'undefined';

export function isSecureContext(): boolean {
  if (!hasWindow()) return false;
  return window.isSecureContext === true;
}

/** Does the browser expose its own barcode decoder, and can it read our formats? */
export async function onDeviceDecoderFormats(): Promise<string[] | null> {
  if (!hasWindow()) return null;
  const Detector = (window as unknown as { BarcodeDetector?: { getSupportedFormats?: () => Promise<string[]> } })
    .BarcodeDetector;
  if (!Detector) return null;
  try {
    const formats = (await Detector.getSupportedFormats?.()) ?? [];
    return Array.isArray(formats) ? formats : [];
  } catch {
    return [];
  }
}

/** The formats a counter cares about, in the order scanners usually need them. */
export const COUNTER_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'] as const;

export function formatLabel(format: string): string {
  switch (format) {
    case 'ean_13': return 'EAN-13';
    case 'ean_8': return 'EAN-8';
    case 'upc_a': return 'UPC-A';
    case 'upc_e': return 'UPC-E';
    case 'code_128': return 'Code 128';
    case 'code_39': return 'Code 39';
    case 'itf': return 'ITF / case code';
    case 'qr_code': return 'QR';
    default: return format;
  }
}

/**
 * Ask the device what it can do. Never throws — an unavailable channel is a
 * sentence, not an exception, because a shop must be able to keep billing on a
 * device that has none of the fancy parts.
 */
export async function detectCaptureReadiness(): Promise<CaptureReadiness> {
  const readiness: CaptureReadiness = {
    camera: { available: false },
    onDeviceDecoder: { available: false },
    wedge: {
      available: true,
      note: 'A USB or Bluetooth scanner types the code into the field below. Nothing to install, nothing to pair in DukaanOS.',
    },
    fingerprint: { available: false },
  };

  if (!hasWindow()) {
    readiness.camera.reason = 'Not running in a browser.';
    readiness.onDeviceDecoder.reason = 'Not running in a browser.';
    readiness.fingerprint.reason = 'Not running in a browser.';
    return readiness;
  }

  const secure = isSecureContext();
  const media = navigator.mediaDevices;
  if (!media?.getUserMedia) {
    readiness.camera.reason = 'This browser cannot open a camera.';
  } else if (!secure) {
    readiness.camera.reason = 'Camera scanning needs HTTPS (or localhost). Use a hardware scanner or type the code.';
  } else {
    readiness.camera.available = true;
  }

  const formats = await onDeviceDecoderFormats();
  if (formats === null) {
    readiness.onDeviceDecoder.reason = 'This browser has no built-in barcode decoder. A hardware scanner or typing still works.';
  } else if (!formats.some((format) => (COUNTER_FORMATS as readonly string[]).includes(format))) {
    readiness.onDeviceDecoder.reason = 'This browser’s decoder does not read the retail barcode formats.';
  } else if (!secure) {
    readiness.onDeviceDecoder.reason = 'The decoder needs HTTPS (or localhost).';
  } else {
    readiness.onDeviceDecoder.available = true;
  }

  try {
    const available = await platformAuthenticatorAvailable();
    readiness.fingerprint.available = available;
    if (!available) {
      readiness.fingerprint.reason = 'No fingerprint sensor is reachable on this device. Enrol from the front-desk tablet or phone that has one.';
    }
  } catch {
    readiness.fingerprint.reason = 'This browser cannot use the fingerprint sensor (WebAuthn is unavailable).';
  }

  return readiness;
}

/**
 * Is there a built-in sensor the member can use (fingerprint, face unlock,
 * Windows Hello)? This is the platform authenticator check: the browser can
 * only answer it in a secure context.
 */
export async function platformAuthenticatorAvailable(): Promise<boolean> {
  if (!hasWindow()) return false;
  const credentials = (window as unknown as { PublicKeyCredential?: typeof PublicKeyCredential }).PublicKeyCredential;
  if (!credentials) return false;
  if (typeof credentials.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false;
  if (!isSecureContext()) return false;
  return credentials.isUserVerifyingPlatformAuthenticatorAvailable();
}
