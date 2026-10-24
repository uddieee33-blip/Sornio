/**
 * Barcodes — reading rules.
 *
 * A counter that scans needs three things from the software, in this order:
 *
 *   1. **Refuse a bad read.** A scanner aimed at a torn label emits garbage.
 *      Every retail code carries a check digit, so Sornio validates it before
 *      the code is allowed to touch the catalogue — a misread packet never
 *      silently becomes a wrong bill.
 *   2. **Name what it read.** `EAN-13`, `UPC-A`, `ITF-14` (the case code on a
 *      carton), a Code 128 supplier label, or one of Sornio's own in-store
 *      labels. Owners recognise the difference and it changes what the code is
 *      allowed to do.
 *   3. **Handle the shop's reality.** Big shops scan manufacturer GTINs; small
 *      shops sell loose atta, dal and sugar that will never have one. So
 *      Sornio prints its own: an **internal label** for anything (Code 128)
 *      and an **in-store EAN-13** (the `2…` range that GS1 reserves for exactly
 *      this) which can carry the weight or the price of a loose item, the way a
 *      counter scale does.
 *
 * Pure functions, no I/O — this module is the reason a scan can be trusted.
 */

import type { BarcodeSymbology } from './types';

/** Nothing longer than this is a label; it is a haystack, or a stuck key. */
export const CODE_MAX_LENGTH = 48;

/** Prefix for codes Sornio minted itself (never issued by GS1). */
export const INTERNAL_PREFIX = 'DK';

/** GS1 restricted-circulation range: `2…` codes exist only inside one shop. */
export const IN_STORE_PREFIX = '2';

/** In-store sub-prefixes — our own convention, documented in the README. */
export const LOOSE_WEIGHT_PREFIX = '21';
export const LOOSE_PRICE_PREFIX = '22';

export type CodeKind = 'retail' | 'in-store' | 'internal' | 'manufacturer' | 'unknown';

export type LooseReading = {
  mode: 'weight' | 'price';
  /** The item's in-store number, matched against `Product.internalCode`. */
  itemNumber: string;
  /** Grams, when the scale printed a weight label. */
  grams?: number;
  /** Rupees, when the scale printed a price label. */
  price?: number;
};

/**
 * Strip what a scanner adds and a human cannot see: control characters, the
 * Enter key most wedges send, and stray spaces at either end. Case is left
 * alone — a supplier's Code 128 may be case-sensitive — and every comparison
 * downstream is case-insensitive anyway.
 */
export function normalizeCode(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f\u200b-\u200d\ufeff]/g, '')
    .trim()
    .slice(0, CODE_MAX_LENGTH);
}

/**
 * Some scanners prefix GS1 data with the AIM identifier (`]C1`, `]Q3`, `]e0`).
 * It describes the symbology, not the product, so it is dropped before matching.
 */
export function stripAimPrefix(code: string): string {
  return code.replace(/^\][A-Za-z][0-9A-Za-z]/, '');
}

/** The GTIN check digit: weights 3,1,3,1… from the digit left of the check. */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  let weight = 3;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    const digit = body.charCodeAt(index) - 48;
    if (digit < 0 || digit > 9) return -1;
    sum += digit * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10;
}

/** True for a structurally valid GTIN-8/12/13/14 — length *and* check digit. */
export function isValidGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  return gtinCheckDigit(code.slice(0, -1)) === Number(code.slice(-1));
}

/** Luhn check digit, used for the codes Sornio mints (see `buildInternalCode`). */
export function luhnCheckDigit(digits: string): number {
  let sum = 0;
  let double = true;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = digits.charCodeAt(index) - 48;
    if (value < 0 || value > 9) return -1;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    double = !double;
    sum += value;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Mint the next internal code: `DK` + 8 digits + a Luhn check digit, e.g.
 * `DK000012345`. It is deliberately short enough to print on a tiny label,
 * carries its own check digit so a typed code can be rejected, and can never
 * collide with a manufacturer GTIN (which is all digits).
 */
export function buildInternalCode(sequence: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(sequence) ? sequence : 0)) % 100_000_000;
  const digits = String(safe).padStart(8, '0');
  return `${INTERNAL_PREFIX}${digits}${luhnCheckDigit(digits)}`;
}

export function isInternalCode(code: string): boolean {
  if (!/^DK\d{9}$/.test(code)) return false;
  return luhnCheckDigit(code.slice(2, 10)) === Number(code.slice(-1));
}

/** `DK000012345` → `DK 0000 12345`, for reading aloud and printing. */
export function formatInternalCode(code: string): string {
  if (!isInternalCode(code)) return code;
  return `${code.slice(0, 2)} ${code.slice(2, 6)} ${code.slice(6, 11)}`;
}

/**
 * Build an in-store EAN-13 for a loose item — the label a weigh-scale prints.
 *
 * Layout: `2` (restricted circulation) + mode (`1` weight grams / `2` price
 * rupees) + 5-digit item number + 5-digit value + check digit. Because it is a
 * real EAN-13, any scanner in the shop reads it with no setup at all.
 */
export function buildLooseCode(input: {
  mode: 'weight' | 'price';
  /** 1–99999. Kept short on purpose: it is typed by a human and read by a scale. */
  itemNumber: number;
  /** Grams for a weight label, whole rupees for a price label. */
  value: number;
}): string {
  const clamp = (value: number) => Math.min(Math.max(Math.floor(Number.isFinite(value) ? value : 0), 0), 99_999);
  const mode = input.mode === 'weight' ? '1' : '2';
  const body = `${IN_STORE_PREFIX}${mode}${String(clamp(input.itemNumber)).padStart(5, '0')}${String(
    clamp(input.value),
  ).padStart(5, '0')}`;
  return `${body}${gtinCheckDigit(body)}`;
}

/** Read an in-store loose label back, or `null` when it is not one. */
export function parseLooseCode(code: string): LooseReading | null {
  const clean = stripAimPrefix(normalizeCode(code));
  if (!/^2[12]\d{11}$/.test(clean)) return null;
  if (!isValidGtin(clean)) return null;
  const mode = clean[1] === '1' ? 'weight' : 'price';
  const itemNumber = clean.slice(2, 7);
  const value = Number(clean.slice(7, 12));
  return mode === 'weight'
    ? { mode, itemNumber, grams: value }
    : { mode, itemNumber, price: value };
}

/**
 * Would a person (or a scanner) plausibly read this as a code?
 *
 * Used to separate "an owner is typing a code" from "a wedge scanner is
 * mid-typing": codes are printable, at least three characters, and never all
 * punctuation.
 */
export function looksLikeCode(raw: string): boolean {
  const code = normalizeCode(raw);
  if (code.length < 3 || code.length > CODE_MAX_LENGTH) return false;
  if (!/^[\x20-\x7e]+$/.test(code)) return false;
  return /[0-9A-Za-z]/.test(code);
}

/** Best-effort symbology, from the shape of the data alone. */
export function guessSymbology(raw: string): BarcodeSymbology {
  const code = stripAimPrefix(normalizeCode(raw));
  if (!code) return 'UNKNOWN';
  if (isInternalCode(code)) return 'INTERNAL';
  if (/^\d+$/.test(code)) {
    if (code.length === 13 && isValidGtin(code)) return 'EAN-13';
    if (code.length === 12 && isValidGtin(code)) return 'UPC-A';
    if (code.length === 8 && isValidGtin(code)) return 'EAN-8';
    if (code.length === 14 && isValidGtin(code)) return 'ITF-14';
    if (code.length === 6) return 'UPC-E';
    // A GTIN-shaped string whose check digit failed is a misread, not a
    // symbology — so it is named UNKNOWN rather than dressed up as Code 128.
    if ([8, 12, 13, 14].includes(code.length)) return 'UNKNOWN';
    // A numeric string of any other length is almost always a supplier's Code 128.
    return 'CODE128';
  }
  if (/^[0-9A-Z\-. $/+%]+$/.test(code)) return 'CODE39';
  return 'CODE128';
}

export type CodeProfile = {
  /** The normalised code. */
  code: string;
  symbology: BarcodeSymbology;
  kind: CodeKind;
  /** Structural validity — a bad check digit is reported, never silently used. */
  valid: boolean;
  /** Present when the code is an in-store loose label. */
  loose?: LooseReading;
  /** One line the owner can read, in the shop's language. */
  note: string;
};

const KIND_NOTES: Record<CodeKind, string> = {
  retail: 'A standard retail GTIN — any scanner reads it, and it is the same code in every shop.',
  'in-store': 'An in-store label minted by this shop, carrying the weight or price of a loose item.',
  internal: 'A Sornio label for an item you stock yourself — unlabelled goods, house brands, loose items.',
  manufacturer: 'A supplier or manufacturer code, not a retail GTIN. Matched against the catalogue as-is.',
  unknown: 'This does not look like a standard barcode. Check the label, or add it as an internal code.',
};

/**
 * Describe a read: what it is, whether it is intact, and what it can be used
 * for. The `/scan` station shows this sentence verbatim, so it is written for
 * the owner, not for a log.
 */
export function describeCode(raw: string): CodeProfile {
  const code = stripAimPrefix(normalizeCode(raw));
  const symbology = guessSymbology(code);

  if (!code) {
    return { code, symbology: 'UNKNOWN', kind: 'unknown', valid: false, note: 'Nothing was read. Scan again or type the code.' };
  }

  const loose = parseLooseCode(code);
  if (loose) {
    const value =
      loose.mode === 'weight'
        ? `${(loose.grams ?? 0) / 1000} kg`
        : `₹${loose.price ?? 0}`;
    return {
      code,
      symbology: 'EAN-13',
      kind: 'in-store',
      valid: true,
      loose,
      note: `In-store label for item #${loose.itemNumber} — ${value} printed at the scale.`,
    };
  }

  if (isInternalCode(code)) {
    return { code, symbology: 'INTERNAL', kind: 'internal', valid: true, note: KIND_NOTES.internal };
  }

  const gtinShaped = [8, 12, 13, 14].includes(code.length) && /^\d+$/.test(code);
  if (gtinShaped && !isValidGtin(code)) {
    return {
      code,
      symbology: 'UNKNOWN',
      kind: 'unknown',
      valid: false,
      note: 'Shaped like a retail barcode, but the check digit does not match — usually a misread. Scan it again; if your supplier really prints this code, link it as an internal code.',
    };
  }

  if (gtinShaped) {
    const kind: CodeKind = code.startsWith(IN_STORE_PREFIX) ? 'in-store' : 'retail';
    return {
      code,
      symbology,
      kind,
      valid: true,
      note: kind === 'in-store'
        ? 'A restricted in-store code. It is only meaningful inside the shop that printed it.'
        : KIND_NOTES.retail,
    };
  }

  if (symbology === 'CODE39' || symbology === 'CODE128') {
    return { code, symbology, kind: 'manufacturer', valid: true, note: KIND_NOTES.manufacturer };
  }

  return { code, symbology, kind: 'unknown', valid: true, note: KIND_NOTES.unknown };
}

/** Codes that two items claim at once — a real and confusing shop problem. */
export function duplicateCodeReport(products: { id: string; name: string; barcode?: string; internalCode?: string }[]): {
  code: string;
  items: { id: string; name: string }[];
}[] {
  const byCode = new Map<string, { id: string; name: string }[]>();
  for (const product of products) {
    for (const code of [product.barcode, product.internalCode]) {
      if (!code) continue;
      const key = code.toUpperCase();
      byCode.set(key, [...(byCode.get(key) ?? []), { id: product.id, name: product.name }]);
    }
  }
  return Array.from(byCode.entries())
    .filter(([, items]) => items.length > 1)
    .map(([code, items]) => ({ code, items }));
}
