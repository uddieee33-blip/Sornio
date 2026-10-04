/**
 * PII / secret redaction.
 *
 * Every log line, telemetry payload, or audit record that leaves a module goes
 * through `redact()` first. The rule is simple: prefer losing a little
 * diagnostic detail over ever persisting a customer's phone number, a UPI ID,
 * an email, a token, or something that looks like a card number.
 *
 * Pure functions only — safe on the server, on the edge, and in the browser.
 */

const PAN_LIKE = /\b(?:\d[ -]*?){13,19}\b/g; // 13–19 digit runs (cards)
const AADHAAR_LIKE = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;
const IFSC_LIKE = /\b[A-Z]{4}0[A-Z0-9]{6}\b/g;
const EMAIL_LIKE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const UPI_LIKE = /\b[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}\b/g;
const PHONE_LIKE = /(?:\+?91[\s-]?)?\b[6-9]\d{9}\b/g;
const JWT_LIKE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g;
const BEARER_LIKE = /\b(?:sk|pk|rk|sbp|eyb)_[A-Za-z0-9_-]{12,}\b/g;
const KEY_VALUE_SECRET =
  /((?:password|passwd|pwd|secret|token|api[_-]?key|authorization|private[_-]?key|service[_-]?role)["'\s]*[:=]["'\s]*)([^\s"',;]{4,})/gi;

/** Mask a value, keeping a short recognisable head so debugging stays possible. */
export function mask(value: string, visible = 2): string {
  const clean = String(value ?? '');
  if (clean.length <= visible) return '••••';
  return `${clean.slice(0, visible)}${'•'.repeat(Math.min(10, Math.max(4, clean.length - visible)))}`;
}

/** Mask an email as `ab•••@domain.tld`. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = String(email ?? '').split('@');
  if (!domain) return mask(local);
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(3, Math.min(8, local.length - 2)))}@${domain}`;
}

/** Mask a phone, keeping the last two digits: `••••••••89`. */
export function maskPhone(phone: string): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length <= 2) return '••••';
  return `${'•'.repeat(Math.max(4, digits.length - 2))}${digits.slice(-2)}`;
}

/** Redact a free-text string of anything that looks sensitive. */
export function redact(input: unknown): string {
  let text = typeof input === 'string' ? input : safeStringify(input);
  if (!text) return '';
  text = text
    .replace(BEARER_LIKE, '[redacted-key]')
    .replace(JWT_LIKE, '[redacted-token]')
    .replace(EMAIL_LIKE, (m) => maskEmail(m))
    .replace(IFSC_LIKE, '[redacted-ifsc]')
    .replace(AADHAAR_LIKE, '[redacted-id]')
    .replace(PAN_LIKE, '[redacted-number]')
    .replace(UPI_LIKE, () => '[redacted-upi]')
    .replace(PHONE_LIKE, (m) => maskPhone(m))
    .replace(KEY_VALUE_SECRET, (_m, prefix: string) => `${prefix}[redacted]`);
  return text.slice(0, 2000);
}

/** Redact every string value inside an object (2 levels deep is plenty for logs). */
export function redactObject<T>(input: T, depth = 0): T {
  if (depth > 3) return undefined as unknown as T;
  if (typeof input === 'string') return redact(input) as unknown as T;
  if (Array.isArray(input)) return input.map((item) => redactObject(item, depth + 1)) as unknown as T;
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (/pass|secret|token|key|authorization|cookie/i.test(key)) {
        out[key] = '[redacted]';
      } else {
        out[key] = redactObject(value, depth + 1);
      }
    }
    return out as unknown as T;
  }
  return input;
}

/** JSON.stringify that survives cycles, BigInt and throwing getters. */
export function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, val) => {
      if (typeof val === 'bigint') return `${val}n`;
      if (typeof val === 'function') return '[function]';
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val as object)) return '[circular]';
        seen.add(val as object);
      }
      return val;
    });
  } catch {
    return '[unserialisable]';
  }
}
