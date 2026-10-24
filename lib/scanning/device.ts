/**
 * Capture devices — what this device can actually do.
 *
 * A shop counter is not a controlled environment: it might be an Android phone
 * with a camera, a ₹6,000 Windows billing PC with a USB laser scanner, or a
 * front-desk tablet with a fingerprint reader. Rather than pretend every device
 * can do everything, Sornio asks the device, reports honestly, and always
 * leaves a way to work:
 *
 *   • **Hardware scanner (keyboard wedge)** — every device has one, because a
 *     USB/Bluetooth scanner is just a keyboard that types very fast. This is the
 *     channel most Indian shops already own, so it is never "unsupported".
 *   • **Camera** — needs HTTPS (a secure context) and a camera.
 *   • **On-device decoding** — the browser's own `BarcodeDetector`. Where it
 *     exists, no image ever leaves the phone; where it does not, the counter
 *     falls back to the wedge and typed entry rather than sending frames to a
 *     server. Sornio has no server-side image pipeline at all.
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

/**
 * Is this page living inside somebody else's frame?
 *
 * It matters more than it sounds. A camera inside an iframe is only allowed if
 * the *parent* page delegated it with `allow="camera"` — and a preview pane, a
 * chat client's built-in browser, or a social app's webview usually does not.
 * The counter then reports "camera refused" and the owner reasonably concludes
 * the software is broken, when the same page in its own tab would have worked.
 * Sornio watches for exactly that case and says which one it is (see
 * `captureBlockedByEmbedding`).
 */
export function isEmbedded(): boolean {
  if (!hasWindow()) return false;
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin parent: reading `top` throws, which is itself the answer.
    return true;
  }
}

/** Open the current page in its own tab — the fix for a blocked permission. */
export function ownTabUrl(): string | null {
  if (!hasWindow()) return null;
  return window.location.href;
}

export type CameraPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

/**
 * What the browser thinks of our camera access, without triggering a prompt.
 *
 * `Permissions.query` is not implemented for `camera` everywhere (Safari being
 * the notable holdout), so this reports `unknown` rather than guessing — and the
 * UI keeps its "the browser will ask" wording in that case.
 */
export async function cameraPermission(): Promise<CameraPermission> {
  if (!hasWindow() || !navigator.permissions?.query) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') return status.state;
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * The wedge test: is the thing plugged into this counter a scanner, or a person
 * typing?
 *
 * A keyboard-wedge scanner emits a whole code in single-digit milliseconds per
 * character and then presses Enter. A human cannot type under ~60 ms a
 * character, and never keeps it up for a 13-digit barcode. Measuring the gaps
 * is how the Devices screen can say "that was your scanner" rather than asking
 * the owner to take it on faith.
 */
export const WEDGE_MAX_GAP_MS = 40;
export const HUMAN_MIN_GAP_MS = 60;

export type WedgeVerdict = 'machine' | 'human' | 'unclear';

export type WedgeReadout = {
  code: string;
  /** Characters seen, excluding the terminating Enter. */
  length: number;
  /** Milliseconds from first key to last key. */
  elapsedMs: number;
  /** Mean gap between keystrokes. */
  averageGapMs: number;
  verdict: WedgeVerdict;
  /** A sentence for the owner, not a chart. */
  summary: string;
};

/**
 * Classify a burst of keystrokes. Pure, so the verifier can run the same
 * arithmetic the console does on a real scan.
 */
export function classifyKeystrokes(gaps: number[]): WedgeVerdict {
  if (gaps.length === 0) return 'unclear';
  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  if (mean <= WEDGE_MAX_GAP_MS) return 'machine';
  if (mean >= HUMAN_MIN_GAP_MS) return 'human';
  return 'unclear';
}

export function readWedgeBurst(code: string, gaps: number[]): WedgeReadout {
  const elapsedMs = gaps.reduce((sum, gap) => sum + gap, 0);
  const averageGapMs = gaps.length > 0 ? elapsedMs / gaps.length : 0;
  const verdict = classifyKeystrokes(gaps);
  const summary =
    verdict === 'machine'
      ? `That was a scanner: ${code.length} characters in ${Math.round(elapsedMs)} ms (${Math.round(averageGapMs)} ms between keys). The counter will read it at this speed.`
      : verdict === 'human'
        ? `That was typed by hand — ${Math.round(averageGapMs)} ms between keys. Still perfectly usable: typed codes go through the same check-digit validation as scanned ones.`
        : `Read in ${Math.round(elapsedMs)} ms, which is between a scanner and a person. If this was your scanner, scan the same label twice — a wedge is consistent.`;
  return { code, length: code.length, elapsedMs, averageGapMs, verdict, summary };
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
      note: 'A USB or Bluetooth scanner types the code into the field below. Nothing to install, nothing to pair in Sornio.',
    },
    fingerprint: { available: false },
    embedded: hasWindow() ? isEmbedded() : false,
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
  } else if (isEmbedded()) {
    // The case a shop owner hits first and understands last: the page is inside
    // another app's frame, and frames only get the camera if the app that
    // embedded them said so. The hardware scanner and the keypad are unaffected.
    readiness.camera.reason =
      'This page is running inside another app’s frame, and that app has not handed over the camera. Open Sornio in its own tab (or browser) and the camera works — or use your handheld scanner, which needs no permission at all.';
  } else {
    const permission = await cameraPermission();
    if (permission === 'denied') {
      readiness.camera.reason =
        'Camera access is blocked for this site in your browser settings. Allow the camera for this address (the padlock in the address bar), then reload — or use your handheld scanner.';
    } else {
      readiness.camera.available = true;
    }
  }

  const formats = await onDeviceDecoderFormats();
  if (formats === null) {
    readiness.onDeviceDecoder.reason =
      'This browser has no built-in barcode decoder (Safari and Firefox do not ship one). A hardware scanner or typing still works.';
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
