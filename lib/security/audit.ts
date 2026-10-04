/**
 * Tamper-evident audit chain.
 *
 * Every important change (a sale, an expense, a settings change, a sign-in)
 * appended here carries `prev` — the hash of the entry before it. Editing or
 * deleting a middle entry breaks the chain, and `verifyChain()` reports exactly
 * where. This is what lets an owner (or an auditor) trust the history tab.
 *
 * Uses Web Crypto SHA-256, so it works in the browser and on the server.
 */

import { randomId, sha256Hex } from './crypto';
import { redact, safeStringify } from './redact';

export type AuditSeverity = 'info' | 'notice' | 'warning' | 'critical';

export type AuditActor = {
  id: string;
  name: string;
  role: string;
};

export type AuditEvent = {
  id: string;
  at: string;
  category: string;
  action: string;
  severity: AuditSeverity;
  actor: AuditActor;
  /** Human-readable summary, already redacted. */
  summary: string;
  /** Structured, redacted metadata. */
  meta?: Record<string, string | number | boolean | null>;
  /** Hash of the previous entry — the chain link. */
  prev: string;
  /** Hash of this entry's canonical payload. */
  hash: string;
};

export const GENESIS_HASH = '0'.repeat(64);

export type NewAuditEvent = {
  category: string;
  action: string;
  severity?: AuditSeverity;
  actor: AuditActor;
  summary: string;
  meta?: Record<string, unknown>;
  at?: string;
};

const SECRET_KEY_PATTERN = /pass|secret|token|key|authorization|cookie|otp|pin/i;

/** Deterministic, redacted representation used for hashing. */
function canonicalise(event: Omit<AuditEvent, 'hash'>): string {
  const meta = event.meta ?? {};
  const sortedMeta: Record<string, unknown> = {};
  for (const key of Object.keys(meta).sort()) {
    sortedMeta[key] = SECRET_KEY_PATTERN.test(key) ? '[redacted]' : meta[key];
  }
  return safeStringify({
    id: event.id,
    at: event.at,
    category: event.category,
    action: event.action,
    severity: event.severity,
    actor: { id: event.actor.id, name: event.actor.name, role: event.actor.role },
    summary: event.summary,
    meta: sortedMeta,
    prev: event.prev,
  });
}

export async function appendAuditEvent(
  chain: AuditEvent[],
  input: NewAuditEvent,
): Promise<AuditEvent> {
  return appendAuditEntry(chain[0]?.hash ?? GENESIS_HASH, input);
}

/**
 * Append using an explicit previous hash.
 *
 * Callers that keep their own record shape (the business store) only need the
 * previous link, not a full `AuditEvent` — this is that entry point.
 */
export async function appendAuditEntry(
  previousHash: string,
  input: NewAuditEvent,
): Promise<AuditEvent> {
  const prev = previousHash || GENESIS_HASH;
  const base: Omit<AuditEvent, 'hash'> = {
    id: randomId('evt'),
    at: input.at ?? new Date().toISOString(),
    category: input.category.slice(0, 40),
    action: input.action.slice(0, 60),
    severity: input.severity ?? 'info',
    actor: {
      id: input.actor.id.slice(0, 60),
      name: redact(input.actor.name).slice(0, 80),
      role: input.actor.role.slice(0, 20),
    },
    summary: redact(input.summary).slice(0, 400),
    meta: normaliseMeta(input.meta),
    prev,
  };
  const hash = await sha256Hex(canonicalise(base));
  return { ...base, hash };
}

function normaliseMeta(meta: Record<string, unknown> | undefined): AuditEvent['meta'] {
  if (!meta) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(meta).slice(0, 20)) {
    if (value === null || typeof value === 'boolean') {
      out[key] = SECRET_KEY_PATTERN.test(key) ? '[redacted]' : value;
    } else if (typeof value === 'number' || typeof value === 'string') {
      out[key] = SECRET_KEY_PATTERN.test(key) ? '[redacted]' : redact(value).slice(0, 300);
    } else {
      out[key] = redact(safeStringify(value)).slice(0, 300);
    }
  }
  return out;
}

export type ChainVerification = {
  valid: boolean;
  /** Entries that carry a hash and were checked. */
  verified: number;
  /** Older entries written before the chain existed — reported, never hidden. */
  unverified: number;
  length: number;
  brokenAt: number | null;
  reason: string | null;
};

/**
 * Does this record carry a chain link? Deliberately structural so any record
 * shape (the store's lighter `AuditEntry`, an imported backup) qualifies.
 */
export function isChained(entry: { hash?: unknown; prev?: unknown }): boolean {
  return typeof entry.hash === 'string' && entry.hash.length === 64 && typeof entry.prev === 'string';
}

/**
 * Walk the chain from the newest entry back to genesis.
 *
 * History written before the chain shipped has no hash. Instead of pretending
 * it verifies, we count it as `unverified` and only assert integrity over the
 * hashed entries — and only while they remain contiguous.
 */
export async function verifyChain(chain: AuditEvent[]): Promise<ChainVerification> {
  const positions = chain
    .map((entry, index) => ({ entry, index }))
    .filter((candidate) => isChained(candidate.entry));

  let unverified = chain.length - positions.length;

  for (let position = 0; position < positions.length; position += 1) {
    const { entry, index } = positions[position];
    const next = positions[position + 1];

    // A legacy entry sitting between two hashed entries breaks contiguity:
    // we cannot prove the link, so we stop asserting rather than claim a pass.
    if (next && next.index !== index + 1) {
      unverified += 1;
      break;
    }

    const expectedPrev = next ? next.entry.hash : GENESIS_HASH;
    if (entry.prev !== expectedPrev) {
      return {
        valid: false,
        verified: position,
        unverified,
        length: chain.length,
        brokenAt: index,
        reason: `Entry ${entry.id} does not link to the entry before it — the history was rearranged.`,
      };
    }

    const rest: Omit<AuditEvent, 'hash'> = { ...entry };
    delete (rest as Partial<AuditEvent>).hash;
    const recomputed = await sha256Hex(canonicalise(rest));
    if (recomputed !== entry.hash) {
      return {
        valid: false,
        verified: position,
        unverified,
        length: chain.length,
        brokenAt: index,
        reason: `Entry ${entry.id} was changed after it was written.`,
      };
    }
  }

  return {
    valid: true,
    verified: positions.length,
    unverified,
    length: chain.length,
    brokenAt: null,
    reason: null,
  };
}

/**
 * A loose record shape, so callers can hand us their own audit entry type
 * (the business store keeps a lighter one) and get a verifiable event back.
 */
export type ChainRecord = {
  id: string;
  createdAt?: string;
  at?: string;
  type?: string;
  category?: string;
  action?: string;
  severity?: AuditSeverity;
  actor?: string | { id?: string; name?: string; role?: string };
  actorId?: string;
  actorRole?: string;
  summary?: string;
  meta?: Record<string, unknown>;
  prev?: string;
  hash?: string;
};

/**
 * Rebuild the canonical event a stored record was hashed from. Any field the
 * writer did not persist stays absent so the recomputed hash either matches
 * exactly or the entry is correctly reported as unverifiable.
 */
export function toChainEvent(record: ChainRecord): AuditEvent {
  const actorObject = typeof record.actor === 'object' && record.actor !== null ? record.actor : undefined;
  const category = record.category ?? record.type ?? 'system';
  return {
    id: record.id,
    at: record.at ?? record.createdAt ?? '',
    category,
    action: record.action ?? category,
    severity: record.severity ?? 'info',
    actor: {
      id: record.actorId ?? actorObject?.id ?? 'local-owner',
      name: typeof record.actor === 'string' ? record.actor : (actorObject?.name ?? 'Owner'),
      role: record.actorRole ?? actorObject?.role ?? 'owner',
    },
    summary: record.summary ?? '',
    meta: record.meta as AuditEvent['meta'],
    prev: record.prev ?? '',
    hash: record.hash ?? '',
  };
}

export function summariseChain(chain: AuditEvent[]): { total: number; lastAt: string | null; bySeverity: Record<AuditSeverity, number> } {
  const bySeverity: Record<AuditSeverity, number> = { info: 0, notice: 0, warning: 0, critical: 0 };
  for (const entry of chain) {
    bySeverity[entry.severity] = (bySeverity[entry.severity] ?? 0) + 1;
  }
  return { total: chain.length, lastAt: chain[0]?.at ?? null, bySeverity };
}
