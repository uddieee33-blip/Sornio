import type { Product } from './billing-types';
import type { BarcodeSuffixMode } from './workstation-types';

/**
 * Normalize raw USB HID barcode scanner input without coercing to a number,
 * preserving leading zeroes (e.g. "0089012345678") while stripping trailing
 * carriage returns, line feeds, tabs, and non-printable control characters.
 */
export function normalizeScannedBarcode(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code >= 0x20 && code !== 0x7f) out += raw[i];
  }
  return out.trim();
}

/** True when a keydown event matches the configured HID scanner suffix key. */
export function matchesBarcodeSuffix(key: string, mode: BarcodeSuffixMode): boolean {
  if (key === 'Enter') return mode === 'enter' || mode === 'enter_or_tab';
  if (key === 'Tab') return mode === 'tab' || mode === 'enter_or_tab';
  return false;
}

/**
 * Guard against hardware double-triggers from a bouncy USB scanner while
 * allowing deliberate repeated scans of the same SKU to increment quantity.
 */
export function isRapidDuplicateScan(
  lastCode: string,
  lastAtMs: number,
  nextCode: string,
  nowMs: number,
  debounceMs = 250,
): boolean {
  if (!lastCode || !nextCode) return false;
  if (lastCode.toLowerCase() !== nextCode.toLowerCase()) return false;
  const elapsed = nowMs - lastAtMs;
  return elapsed >= 0 && elapsed < debounceMs;
}

// Codes are strings: converting them to numbers destroys leading zeroes.
export function buildSkuIndex(products: readonly Product[]): Map<string, Product[]> {
  const index = new Map<string, Product[]>();
  for (const product of products) {
    const code = normalizeScannedBarcode(product.sku).toLowerCase();
    if (!code) continue;
    const bucket = index.get(code);
    if (bucket) bucket.push(product);
    else index.set(code, [product]);
  }
  return index;
}

export function findCodeIndexed(index: ReadonlyMap<string, Product[]>, input: string): Product[] {
  const code = normalizeScannedBarcode(input).toLowerCase();
  if (!code) return [];
  return index.get(code) ?? [];
}

export function findCode(products: Product[], input: string): Product[] {
  return findCodeIndexed(buildSkuIndex(products), input);
}

/**
 * Detect when a USB HID barcode scanner fires while keyboard focus is still
 * inside a numeric quantity field (e.g. "0089011100001" or "8901110000123" or
 * an alphanumeric SKU). Short plain numbers like "1", "2.5", "12", or "250"
 * never match so deliberate quantity edits are unaffected.
 */
export function detectBarcodeInQuantityField(
  typed: string,
  skuIndex: ReadonlyMap<string, Product[]>,
): Product[] {
  const cleaned = normalizeScannedBarcode(typed);
  if (cleaned.length < 4) return [];
  const hasLeadingZero = cleaned.startsWith('0') && !cleaned.startsWith('0.');
  const hasLetters = /[a-zA-Z]/.test(cleaned);
  const longDigits = /^\d{6,}$/.test(cleaned);
  if (!hasLeadingZero && !hasLetters && !longDigits) return [];
  return findCodeIndexed(skuIndex, cleaned);
}

export function scanNeedsQuantity(product: Product): boolean {
  return product.unit !== 'pcs';
}
