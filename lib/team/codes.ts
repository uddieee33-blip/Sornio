/**
 * Invite codes: human-shareable, brute-forcible only at the rate limit.
 *
 * An invite code is spoken across a counter or pasted into WhatsApp, so the
 * alphabet drops every ambiguous glyph (no 0/O, 1/I/L) and the display form is
 * grouped `DKN-XXXX-XXXX`. What is stored in `team_invites` is only the
 * SHA-256 of the normalised form — a leak of the table hands out nothing, the
 * same discipline the app applies to passwords.
 *
 * Eight characters from a 32-symbol alphabet is ~2^40 space. That is not a
 * password; the protection is that guessing it costs one HTTP request against
 * the tight `auth` bucket (`policy.json`), the same ceiling as credential
 * stuffing.
 */

import { sha256Hex } from '@/lib/security/crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 32 unambiguous symbols
const CODE_SYMBOLS = 8;
export const CODE_DISPLAY_PREFIX = 'DKN-';

/** Strip formatting a person may have typed or autocorrect may have added. */
export function normaliseInviteCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^DKN/, '') // the prefix is presentation, not entropy
    .slice(0, CODE_SYMBOLS);
}

/** `DKN-XXXX-XXXX` for display; the bare symbols are what gets hashed. */
export function formatInviteCode(symbols: string): string {
  return `${CODE_DISPLAY_PREFIX}${symbols.slice(0, 4)}-${symbols.slice(4, 8)}`;
}

/** The pair the API needs: one value to show the owner, one to persist. */
export async function mintInviteCode(): Promise<{ code: string; hash: string }> {
  const bytes = new Uint8Array(CODE_SYMBOLS);
  globalThis.crypto.getRandomValues(bytes);
  const symbols = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return { code: formatInviteCode(symbols), hash: await sha256Hex(symbols) };
}

/** Hash a raw, possibly messy code the way it would have been stored. */
export async function inviteCodeHash(raw: unknown): Promise<string> {
  const symbols = normaliseInviteCode(raw);
  if (symbols.length !== CODE_SYMBOLS) return '';
  return sha256Hex(symbols);
}
