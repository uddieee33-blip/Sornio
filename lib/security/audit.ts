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
  const previous = chain[0];
  const prev = previous?.hash ?? GENESIS_HASH;
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
  length: number;
  brokenAt: number | null;
  reason: string | null;
};

/** Walk the chain from the newest entry back to genesis. */
export async function verifyChain(chain: AuditEvent[]): Promise<ChainVerification> {
  for (let index = 0; index < chain.length; index += 1) {
    const entry = chain[index];
    const expectedPrev = chain[index + 1]?.hash ?? GENESIS_HASH;
    if (entry.prev !== expectedPrev) {
      return {
        valid: false,
        length: chain.length,
        brokenAt: index,
        reason: `Entry ${entry.id} does not link to the entry before it.`,
      };
    }
    const rest: Omit<AuditEvent, 'hash'> = { ...entry };
    delete (rest as Partial<AuditEvent>).hash;
    const recomputed = await sha256Hex(canonicalise(rest));
    if (recomputed !== entry.hash) {
      return {
        valid: false,
        length: chain.length,
        brokenAt: index,
        reason: `Entry ${entry.id} was modified after it was written.`,
      };
    }
  }
  return { valid: true, length: chain.length, brokenAt: null, reason: null };
}

export function summariseChain(chain: AuditEvent[]): { total: number; lastAt: string | null; bySeverity: Record<AuditSeverity, number> } {
  const bySeverity: Record<AuditSeverity, number> = { info: 0, notice: 0, warning: 0, critical: 0 };
  for (const entry of chain) {
    bySeverity[entry.severity] = (bySeverity[entry.severity] ?? 0) + 1;
  }
  return { total: chain.length, lastAt: chain[0]?.at ?? null, bySeverity };
}
