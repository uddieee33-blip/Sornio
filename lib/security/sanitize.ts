/**
 * Output sanitisation.
 *
 * React escapes text nodes for us, but two places in DukaanOS build markup by
 * hand: the printable receipt/invoice window and CSV exports. Both go through
 * this module. Rules:
 *  - HTML: escape everything, allow nothing (no tags, no attributes, no URLs).
 *  - CSV: neutralise spreadsheet formula injection (=, +, -, @, tab, CR).
 *  - URLs: only same-origin relative paths, http(s), upi:, and tel:/mailto:.
 */

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
  '/': '&#47;',
  '=': '&#61;',
};

/** Escape every character that could ever terminate a tag or attribute. */
export function escapeHtml(input: unknown): string {
  return String(input ?? '').replace(/[&<>"'`/=\u0000-\u001F]/g, (char) =>
    HTML_ENTITIES[char] ?? `&#${char.charCodeAt(0)};`,
  );
}

/** Escape a value that is destined for an HTML attribute. */
export function escapeAttribute(input: unknown): string {
  return escapeHtml(input).replace(/\r?\n/g, ' ');
}

const CONTROL_HEADERS = ['http-equiv', 'refresh'];

/** Strip anything tag-like from a string that must stay plain text. */
export function stripTags(input: unknown): string {
  const text = String(input ?? '');
  if (CONTROL_HEADERS.some((header) => text.toLowerCase().includes(header))) {
    return '';
  }
  return text.replace(/<\/?[^>]*>/g, '').replace(/javascript:/gi, '').trim();
}

/**
 * Spreadsheet-safe cell. Excel/Sheets execute any cell starting with
 * = + - @ or a control char, so those get a defensive leading apostrophe.
 */
export function csvCell(input: unknown): string {
  let value = String(input ?? '');
  if (/^[=+\-@\t\r]/.test(value) || /^[=+\-@]/.test(value.replace(/^'/, ''))) {
    value = `'${value}`;
  }
  const escaped = value.replace(/"/g, '""');
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

/** Build a CSV document from rows of primitives, safely. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\r\n');
}

const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:', 'upi:'];

/** Only allow URLs we would be comfortable rendering into an href. */
export function safeUrl(input: unknown, options: { allowRelative?: boolean } = {}): string | null {
  const { allowRelative = true } = options;
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  if (allowRelative && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const url = new URL(raw);
    if (!SAFE_PROTOCOLS.includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Build a `tel:` link from an Indian mobile number. */
export function telHref(phone: unknown): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const normalised = digits.length === 10 ? `91${digits}` : digits;
  return `tel:+${normalised}`;
}

/** Build a `https://wa.me` link without letting the input shape the host. */
export function whatsappHref(phone: unknown, message?: string): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const normalised = digits.length === 10 ? `91${digits}` : digits;
  const query = message ? `?text=${encodeURIComponent(String(message).slice(0, 600))}` : '';
  return `https://wa.me/${normalised}${query}`;
}

/** Escape a JSON payload before embedding it in a <script> tag. */
export function safeJsonScript(payload: unknown): string {
  return JSON.stringify(payload ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
