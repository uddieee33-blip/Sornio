/**
 * Input validation & sanitisation.
 *
 * Every value that comes from a human (or from localStorage, which is equally
 * untrusted) is parsed here before it reaches the store. Validation is
 * *structural*: unknown keys are dropped, numbers are clamped to sane ranges,
 * strings are length-capped. A payload either comes back clean or it is
 * rejected with a message we are happy to show a shop owner.
 */

export type FieldError = { field: string; message: string };
export type Validated<T> = { ok: true; value: T } | { ok: false; errors: FieldError[] };

export const LIMITS = {
  name: 120,
  shortText: 240,
  longText: 2000,
  notes: 4000,
  maxMoney: 1_000_000_000, // ₹100 crore — beyond this a shop owner has a data-entry bug
  maxQuantity: 1_000_000,
  maxPercent: 100,
  minPassword: 10,
} as const;

/** Strip control characters and collapse runaway whitespace. */
export function cleanText(input: unknown, maxLength: number = LIMITS.shortText): string {
  return String(input ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s{3,}/g, '  ')
    .trim()
    .slice(0, maxLength);
}

/** Single-line variant for names/titles that must never contain line breaks. */
export function cleanLine(input: unknown, maxLength: number = LIMITS.name): string {
  return cleanText(input, maxLength).replace(/[\r\n\t]+/g, ' ');
}

export function isBlank(value: unknown): boolean {
  return cleanText(value).length === 0;
}

/** Parse a money/quantity field. Rejects NaN, Infinity, negatives (unless allowed). */
export function parseAmount(
  input: unknown,
  options: { min?: number; max?: number; allowFloat?: boolean; allowNegative?: boolean } = {},
): number | null {
  const { min = 0, max = LIMITS.maxMoney, allowFloat = true, allowNegative = false } = options;
  if (input === '' || input === null || input === undefined) return null;
  const raw = typeof input === 'string' ? input.replace(/[,\s₹]/g, '') : input;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return null;
  const normalised = allowFloat ? value : Math.trunc(value);
  if (!allowNegative && normalised < 0) return null;
  if (normalised < min || normalised > max) return null;
  // Round to paise to avoid float drift in the ledger.
  return Math.round(normalised * 100) / 100;
}

export function isEmail(value: string): boolean {
  const email = cleanLine(value, 254);
  if (!email || email.length > 254) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(email);
}

export function isPhone(value: string): boolean {
  const digits = String(value ?? '').replace(/\D/g, '');
  const local = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(local);
}

export function isUpiLike(value: string): boolean {
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(String(value ?? '').trim());
}

/** Password strength: length first, then variety. Returns a 0–4 score + advice. */
export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; advice: string } {
  const value = String(password ?? '');
  if (value.length < 8) return { score: 0, advice: 'Use at least 10 characters.' };
  let score = 0;
  if (value.length >= LIMITS.minPassword) score += 1;
  if (value.length >= 14) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  const advice =
    score >= 4
      ? 'Strong.'
      : score === 3
        ? 'Good — add a symbol or another word.'
        : 'Mix upper case, lower case, a number, and a symbol.';
  return { score: Math.min(4, score) as 0 | 1 | 2 | 3 | 4, advice };
}

/**
 * Structural validator for the persisted store. Anything that fails is
 * repaired with a safe default rather than thrown away, so a partially
 * corrupted local database never bricks the console.
 */
export function validateRecord<T extends object>(
  input: unknown,
  required: (keyof T)[],
  coerce: (record: Record<string, unknown>) => T | null,
): T | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  for (const key of required) {
    if (record[key as string] === undefined || record[key as string] === null) return null;
  }
  return coerce(record);
}

/** Drop duplicate ids from a list (defence against hand-edited local storage). */
export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/** Cap a list so a malicious/buggy import cannot freeze the tab. */
export function capList<T>(items: T[], max: number): T[] {
  return items.length > max ? items.slice(0, max) : items;
}
