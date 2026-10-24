/**
 * The owner profile that outlives a device.
 *
 * Everything an owner types during setup — their name, phone, address, the
 * business name, the trade they picked, the UPI id the collection QR is built
 * from — used to live in exactly one place: the encrypted vault on the browser
 * that typed it. That made "Welcome back" a sentence the app could not back up.
 * Sign in on a second phone, clear the browser data, reinstall the PWA, and the
 * console greeted the owner by name and then asked them for their own phone
 * number.
 *
 * This module is the shape that travels. It is deliberately free of React, of
 * `next/*` and of any Supabase client so that:
 *
 *   • the server can validate a payload with the *same* rules the browser used
 *     to build it (`parseProfilePayload`), rather than trusting the client;
 *   • the "whose copy is newer" decision is one pure function (`remoteWins`)
 *     that `npm run verify:profile` can execute, instead of an `if` buried in a
 *     `useEffect` where no test reaches it;
 *   • nothing here can decide to write anything. Reading a row and building a
 *     snapshot are the only things it does.
 *
 * What is stored, and what is never stored: the collection UPI id and sensitive
 * bank details (holder name, bank, account number, IFSC). A collection QR needs
 * only the UPI id and payee name. Never a UPI PIN, an OTP, a
 * card number or a password, because the app does not hold those anywhere and
 * this table is not where it would start.
 */

import { isValidIfsc, isValidUpiId, normalizeUpiId } from '@/lib/upi';

/**
 * The bank half of a profile, spelled out rather than aliased to `BankDetails`
 * so the wire format is a closed list. A field added to `BankDetails` for a
 * customer record does not silently start travelling to the database.
 */
export type ProfileBank = {
  upiId?: string;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  ifsc?: string;
};

/**
 * The profile as the store keeps it. Structural on purpose: `BusinessProfile`
 * in `lib/store.tsx` satisfies this exactly, and importing the store's type
 * here would pull React into a module the server compiles on its own.
 */
export type StoredProfile = {
  name: string;
  templateId: string;
  description: string;
  currency: string;
  timezone: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  gstin?: string;
  upiId?: string;
  bank?: ProfileBank;
  /** ISO timestamp of the last local edit — the merge's only tiebreaker. */
  updatedAt?: string;
};

/** One owner profile, ready to cross a wire or land in a row. */
export type ProfileSnapshot = {
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  gstin?: string;
  businessName: string;
  description: string;
  templateId: string;
  currency: string;
  timezone: string;
  upiId: string;
  bank: ProfileBank;
  /** ISO timestamp. Written by the client that made the edit. */
  updatedAt: string;
  /** Derived, never trusted from a client — see `isSetupComplete`. */
  setupComplete: boolean;
};

/** The longest a single line of a profile may be. Longer is a paste, not a name. */
const MAX_LINE = 120;
const MAX_DESCRIPTION = 600;
/** An address is capped at 254 by RFC 5321. */
const MAX_EMAIL = 254;

/** Shape validation only: registry status and checksum are not verified here. */
export function isValidGstin(value: unknown): boolean {
  const candidate = String(value ?? '').trim().toUpperCase();
  return /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(candidate);
}


/** Strip control characters, collapse whitespace, cap the length. */
function line(value: unknown, maxLength = MAX_LINE): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** A multi-line variant, for the one field that is a paragraph. */
function paragraph(value: unknown, maxLength = MAX_DESCRIPTION): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

/** `+91 98xxx xxxxx` → `98xxxxxxxx`; the digits are the only part that matters. */
function phoneDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '').slice(0, 15);
}

/**
 * Is an ISO timestamp this module is willing to compare?
 *
 * Not a strict RFC parser — a strict one would reject the perfectly good
 * `2026-10-11T19:00:00.000Z` variants the platform emits. It has to be enough
 * that lexicographic comparison is chronological, and enough that a client
 * cannot push a timestamp of `'9999'` or `''` into the merge.
 */
export function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 20 || value.length > 40) return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const parsed = Date.parse(value);
  // Refuse the far past and the far future: a clock set to 2099 would win every
  // merge it took part in, forever, on every device.
  return Number.isFinite(parsed) && parsed > Date.UTC(2020, 0, 1) && parsed < Date.UTC(2100, 0, 1);
}

function bankFrom(value: unknown): ProfileBank {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const upiId = line(source.upiId, 60);
  const bank: ProfileBank = {};
  if (isValidUpiId(upiId)) bank.upiId = normalizeUpiId(upiId);
  const bankName = line(source.bankName, 80);
  if (bankName) bank.bankName = bankName;
  const accountHolder = line(source.accountHolder, MAX_LINE);
  if (accountHolder) bank.accountHolder = accountHolder;
  const accountNumber = String(source.accountNumber ?? '')
    .replace(/\s/g, '')
    .slice(0, 20);
  if (/^\d{6,20}$/.test(accountNumber)) bank.accountNumber = accountNumber;
  const ifsc = line(source.ifsc, 11).toUpperCase();
  if (isValidIfsc(ifsc)) bank.ifsc = ifsc;
  return bank;
}

/** The snapshot an owner who has typed nothing yet. */
export function emptySnapshot(): ProfileSnapshot {
  return {
    ownerName: '',
    ownerPhone: '',
    ownerEmail: '',
    gstin: '',
    businessName: '',
    description: '',
    templateId: '',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    upiId: '',
    bank: {},
    updatedAt: '',
    setupComplete: false,
  };
}

/** Build the travelling shape from the profile the store holds. */
export function snapshotFromProfile(profile: StoredProfile | null | undefined): ProfileSnapshot {
  if (!profile) return emptySnapshot();
  const upiId = normalizeUpiId(profile.upiId ?? profile.bank?.upiId ?? '');
  const updatedAt = isTimestamp(profile.updatedAt) ? profile.updatedAt : '';
  const snapshot: ProfileSnapshot = {
    ownerName: line(profile.ownerName),
    ownerPhone: line(profile.ownerPhone, 32),
    ownerEmail: line(profile.ownerEmail, MAX_EMAIL).toLowerCase(),
    gstin: isValidGstin(profile.gstin) ? String(profile.gstin).trim().toUpperCase() : '',
    businessName: line(profile.name),
    description: paragraph(profile.description),
    templateId: line(profile.templateId, 60),
    currency: line(profile.currency, 8) || 'INR',
    timezone: line(profile.timezone, 40) || 'Asia/Kolkata',
    upiId: isValidUpiId(upiId) ? upiId : '',
    bank: bankFrom(profile.bank ?? {}),
    updatedAt,
    setupComplete: false,
  };
  snapshot.setupComplete = isSetupComplete(snapshot);
  return snapshot;
}

/**
 * Has this owner finished setting up?
 *
 * Recomputed from the fields rather than read from a flag, because a stored
 * boolean can be set by anything that can write the row — including a client
 * that has not actually collected a UPI id. The four things that make a console
 * usable are the ones checked: who owns it, how to reach them, what it is called,
 * and which trade shapes the screens. Payment details are optional; adding a
 * valid UPI ID enables the QR preview without changing setup completion.
 */
export function isSetupComplete(snapshot: ProfileSnapshot): boolean {
  if (!snapshot.ownerName) return false;
  if (phoneDigits(snapshot.ownerPhone).length < 10) return false;
  if (!snapshot.businessName) return false;
  if (!snapshot.templateId) return false;
  return true;
}

/** Turn a snapshot back into the shape the store keeps. */
export function profileFromSnapshot(snapshot: ProfileSnapshot): StoredProfile {
  return {
    name: snapshot.businessName,
    templateId: snapshot.templateId,
    description: snapshot.description,
    currency: snapshot.currency || 'INR',
    timezone: snapshot.timezone || 'Asia/Kolkata',
    ownerName: snapshot.ownerName,
    ownerPhone: snapshot.ownerPhone,
    ownerEmail: snapshot.ownerEmail || undefined,
    gstin: snapshot.gstin || undefined,
    upiId: snapshot.upiId || undefined,
    bank: { ...snapshot.bank },
    updatedAt: snapshot.updatedAt || undefined,
  };
}

/**
 * Whose copy wins.
 *
 * Last write wins on the client's own clock, which is the only clock both
 * devices share a meaning for: a server `NOW()` on one device and a browser
 * clock on another cannot be ordered against each other. Ties go to the copy
 * already on the device, so a pull that races an edit cannot undo the edit.
 *
 * A local profile with no timestamp predates this feature. It loses to anything
 * the server knows, which is the whole point — that owner's details are on the
 * server and the device has forgotten them.
 */
export function remoteWins(localUpdatedAt: string | undefined, remoteUpdatedAt: string): boolean {
  if (!isTimestamp(remoteUpdatedAt)) return false;
  if (!localUpdatedAt || !isTimestamp(localUpdatedAt)) return true;
  return Date.parse(remoteUpdatedAt) > Date.parse(localUpdatedAt);
}

/** The column names of `owner_profiles`, as the server writes them. */
export function rowFromSnapshot(snapshot: ProfileSnapshot): Record<string, unknown> {
  return {
    owner_name: snapshot.ownerName,
    owner_phone: snapshot.ownerPhone,
    owner_email: snapshot.ownerEmail,
    gstin: snapshot.gstin || '',
    business_name: snapshot.businessName,
    description: snapshot.description,
    template_id: snapshot.templateId,
    currency: snapshot.currency || 'INR',
    timezone: snapshot.timezone || 'Asia/Kolkata',
    upi_id: snapshot.upiId || null,
    bank: snapshot.bank,
    setup_complete: snapshot.setupComplete,
    // The client's clock, because that is what `remoteWins` compares against.
    updated_at: isTimestamp(snapshot.updatedAt) ? snapshot.updatedAt : new Date().toISOString(),
  };
}

/** Read an `owner_profiles` row into a snapshot, or `null` if it is not one. */
export function snapshotFromRow(row: unknown): ProfileSnapshot | null {
  if (!row || typeof row !== 'object') return null;
  const source = row as Record<string, unknown>;
  // PostgREST rows use snake_case; GET /api/profile sends ProfileSnapshot
  // camelCase JSON. Decode either so returning owners keep their details.
  const updated = source.updated_at ?? source.updatedAt;
  const updatedAt = isTimestamp(updated) ? updated : '';
  const snapshot: ProfileSnapshot = {
    ownerName: line(source.owner_name ?? source.ownerName),
    ownerPhone: line(source.owner_phone ?? source.ownerPhone, 32),
    ownerEmail: line(source.owner_email ?? source.ownerEmail, MAX_EMAIL).toLowerCase(),
    gstin: isValidGstin(source.gstin) ? String(source.gstin).trim().toUpperCase() : '',
    businessName: line(source.business_name ?? source.businessName),
    description: paragraph(source.description),
    templateId: line(source.template_id ?? source.templateId, 60),
    currency: line(source.currency, 8) || 'INR',
    timezone: line(source.timezone, 40) || 'Asia/Kolkata',
    upiId: normalizeUpiId(String(source.upi_id ?? source.upiId ?? '')),
    bank: bankFrom(source.bank ?? {}),
    updatedAt,
    setupComplete: false,
  };
  snapshot.setupComplete = isSetupComplete(snapshot);
  return snapshot;
}

/**
 * Validate a profile coming *in* from a browser.
 *
 * The server calls this on every `PUT /api/profile` before anything reaches
 * Postgres. It is an allow-list, not a sanitizer: a key that is not one of the
 * eleven below is dropped, so a client cannot add a column's worth of junk, and
 * every value is length-capped and control-character-stripped on the way
 * through. Payment details are optional, but supplied values must validate.
 * Validate the raw destination before the tolerant legacy row decoder runs:
 * silently dropping or truncating it could save a different payment address.
 */
export function parseProfilePayload(
  input: unknown,
  options: { isKnownTemplateId?: (value: unknown) => boolean } = {},
): { ok: true; snapshot: ProfileSnapshot } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Expected a JSON body.' };
  }
  const body = input as Record<string, unknown>;
  const upiId = normalizeUpiId(String(body.upiId ?? ''));
  if (body.bank != null && (typeof body.bank !== 'object' || Array.isArray(body.bank))) {
    return { ok: false, error: 'Expected bank details to be an object.' };
  }
  const rawBank = (body.bank ?? {}) as Record<string, unknown>;
  const bankUpi = normalizeUpiId(String(rawBank.upiId ?? ''));
  if ((upiId && (!isValidUpiId(upiId) || upiId.length > 60)) || (bankUpi && (!isValidUpiId(bankUpi) || bankUpi.length > 60))) {
    return { ok: false, error: 'Enter a valid UPI ID, or leave it blank and activate payments later.' };
  }
  if (upiId && bankUpi && upiId !== bankUpi) {
    return { ok: false, error: 'The collection UPI IDs must match.' };
  }
  const accountNumber = String(rawBank.accountNumber ?? '').replace(/\s/g, '');
  const ifsc = String(rawBank.ifsc ?? '').trim().toUpperCase();
  if (accountNumber && !/^\d{6,20}$/.test(accountNumber)) return { ok: false, error: 'Account numbers have 6–20 digits.' };
  if ((ifsc || accountNumber) && !isValidIfsc(ifsc)) return { ok: false, error: 'Enter a valid IFSC code (e.g. HDFC0001234).' };
  if (accountNumber && !line(rawBank.accountHolder)) return { ok: false, error: 'Enter the account holder name as shown by your bank.' };
  const collectionUpi = upiId || bankUpi;
  const snapshot: ProfileSnapshot = {
    ownerName: line(body.ownerName),
    ownerPhone: line(body.ownerPhone, 32),
    ownerEmail: line(body.ownerEmail, MAX_EMAIL).toLowerCase(),
    gstin: String(body.gstin ?? '').trim().toUpperCase(),
    businessName: line(body.businessName),
    description: paragraph(body.description),
    templateId: line(body.templateId, 60),
    currency: line(body.currency, 8) || 'INR',
    timezone: line(body.timezone, 40) || 'Asia/Kolkata',
    upiId: collectionUpi,
    bank: { ...bankFrom(rawBank), ...(collectionUpi ? { upiId: collectionUpi } : {}) },
    // A timestamp the client did not send, or one it invented, falls back to
    // now: the merge needs a real one and `'9999'` is not.
    updatedAt: isTimestamp(body.updatedAt) ? body.updatedAt : new Date().toISOString(),
    setupComplete: false,
  };

  if (snapshot.gstin && !isValidGstin(snapshot.gstin)) return { ok: false, error: 'Enter a valid 15-character GSTIN or leave it blank.' };
  if (!snapshot.ownerName) return { ok: false, error: 'Your name is required.' };
  if (phoneDigits(snapshot.ownerPhone).length < 10) return { ok: false, error: 'Enter a valid 10-digit phone number.' };
  if (!snapshot.businessName) return { ok: false, error: 'Business name is required.' };
  if (snapshot.templateId && options.isKnownTemplateId && !options.isKnownTemplateId(snapshot.templateId)) {
    return { ok: false, error: 'Unknown business type.' };
  }
  // Optional, but if it is there it has to be an address: this is the one field
  // a receipt or a reminder is sent to, and a typo here is silent.
  if (snapshot.ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(snapshot.ownerEmail)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }

  snapshot.setupComplete = isSetupComplete(snapshot);
  return { ok: true, snapshot };
}

/**
 * Merge a pulled profile into the one on this device.
 *
 * Returns the snapshot to adopt, or `null` when the device's own copy is the
 * newer one and nothing should change. Everything that reads a profile from the
 * server goes through this, so the "did the console just overwrite what I typed"
 * question has one answer in one place.
 */
export function adoptRemoteProfile(local: StoredProfile | null | undefined, remote: ProfileSnapshot | null): ProfileSnapshot | null {
  if (!remote) return null;
  if (!remoteWins(local?.updatedAt, remote.updatedAt)) return null;
  return remote;
}
