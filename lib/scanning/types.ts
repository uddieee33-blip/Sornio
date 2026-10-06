/**
 * Scanning & capture — domain types.
 *
 * DukaanOS already knows how to record a sale, a stock movement and a visit.
 * This layer answers a narrower question: **how did that record get created?**
 *
 * A kirana counter creates it by reading the packet in the cashier's hand; a
 * mobile shop by reading the IMEI box; a gym by reading a finger on the pad at
 * the front desk. Those are different capture channels with different failure
 * modes, so they get their own vocabulary — and the portal blueprint decides
 * which channels a trade actually uses (see `lib/portals/types.ts`).
 *
 * Pure data. Safe to import from anywhere, including Edge middleware.
 */

/** How a counter can capture an identifier. */
export type CaptureChannel = 'barcode' | 'qr' | 'keypad' | 'fingerprint';

/** Where a read physically came from. */
export type ScanSource =
  /** Handheld USB/Bluetooth scanner typing into the page (a "keyboard wedge"). */
  | 'wedge'
  /** The device camera, decoded in the browser. */
  | 'camera'
  /** Typed by a person because the label was torn or the scanner was asleep. */
  | 'manual'
  /** Restored from a file the owner imported (supplier price list, CSV). */
  | 'import';

/** The screens a scan can be made from. Kept explicit so history is traceable. */
export type ScanContext = 'counter' | 'inward' | 'catalog' | 'label' | 'link';

/** A symbology DukaanOS can name, validate, or print a label for. */
export type BarcodeSymbology =
  | 'EAN-13'
  | 'EAN-8'
  | 'UPC-A'
  | 'UPC-E'
  | 'ITF-14'
  | 'CODE128'
  | 'CODE39'
  | 'QR'
  | 'INTERNAL'
  | 'UNKNOWN';

/** What happened when a code met the catalogue. */
export type ScanOutcome = 'matched' | 'ambiguous' | 'unmatched' | 'invalid';

/** How a loose item is priced when the counter weighs it. */
export type LooseMode = 'none' | 'weight' | 'price';

/**
 * One read, permanently recorded.
 *
 * This is the audit trail of the scanner itself: an owner can see that 412
 * packets were scanned at the counter today, and — more usefully — which codes
 * came back unmatched. Unmatched codes are not an error state to hide; they are
 * the shop telling you which item still needs a barcode on file.
 */
export type ScanEvent = {
  id: string;
  /** The code as read, normalised (control characters stripped, trimmed). */
  code: string;
  symbology: BarcodeSymbology;
  source: ScanSource;
  context: ScanContext;
  outcome: ScanOutcome;
  /** Set when the code resolved to a catalogue item. */
  productId?: string;
  /** Name copied at scan time so history survives a renamed item. */
  productName?: string;
  /** Units the code carried: weigh-scale labels carry a value, packets carry 1. */
  quantity?: number;
  at: string;
  by?: string;
};

/**
 * A member's fingerprint, as far as DukaanOS is concerned.
 *
 * **There is no fingerprint in this record, and there cannot be one.** The
 * sensor belongs to the device; the browser's WebAuthn API verifies the finger
 * locally and hands back nothing but a credential id and a public key. DukaanOS
 * stores the id (so it can ask the same device to verify the same finger) and
 * never sees, transmits, or keeps an image or a template. That is why this row
 * is safe to keep next to a member record — and why deleting it is the whole of
 * "forget my fingerprint".
 */
export type BiometricCredential = {
  id: string;
  memberId: string;
  /** Name copied at enrolment time, so history survives a renamed member. */
  memberName: string;
  /** Base64url credential id issued by the platform authenticator. */
  credentialId: string;
  /** Always the sensor built into the device (never an external security key). */
  attachment: 'platform';
  /** What the member calls it: "Right thumb · front-desk tablet". */
  label: string;
  createdAt: string;
  lastUsedAt?: string;
  /** Visits unlocked by this finger — proof the enrolment still works. */
  useCount: number;
};

/** Honest capability report for the device the console is running on. */
export type CaptureReadiness = {
  /** A camera exists *and* the page can ask for it (secure context). */
  camera: { available: boolean; reason?: string };
  /** The browser can decode barcodes itself (BarcodeDetector API). */
  onDeviceDecoder: { available: boolean; reason?: string };
  /** A hardware scanner can type into the page — always true, it is just a keyboard. */
  wedge: { available: true; note: string };
  /** A fingerprint sensor is reachable through WebAuthn on this device. */
  fingerprint: { available: boolean; reason?: string };
};
