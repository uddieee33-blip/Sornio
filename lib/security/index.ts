/**
 * DukaanOS security layer — public surface.
 *
 * Layered deliberately, so a caller can pick the narrowest tool:
 *
 *   ┌ identity ─────── session.ts    signed, expiring, rotating sessions
 *   │ tenancy ──────── tenant.ts     every record scoped to one business
 *   │ authorisation ── rbac.ts       owner / manager / cashier / auditor
 *   │ transport ────── headers.ts    CSP, HSTS, framing, permissions
 *   │ edge ─────────── rate-limit.ts throttling + abuse control
 *   │ request ──────── csrf.ts       origin + fetch-metadata + double submit
 *   │ input ────────── validation.ts structural validation, clamps, limits
 *   │ output ───────── sanitize.ts   HTML/CSV/URL escaping
 *   │ storage ──────── vault.ts      AES-GCM-256 at rest in the browser
 *   │ evidence ─────── audit.ts      hash-chained, tamper-evident history
 *   │ privacy ──────── redact.ts     PII/secret scrubbing for every log
 *   │ observability ── monitor.ts    bounded, redacted client telemetry
 *   └ primitives ───── crypto.ts     Web Crypto only, no Node built-ins
 *
 * Import from `@/lib/security` rather than reaching into single files.
 */

export * from './rbac';
export * from './redact';
export * from './sanitize';
export * from './validation';
export { randomId, randomToken, sha256Hex, constantTimeEqual } from './crypto';
export { can as canDo, ROLE_MATRIX } from './rbac';
export {
  isValidTenantId,
  tenantStorageKey,
  type TenantScope,
} from './tenant';
export {
  SESSION_COOKIE,
  sessionCookieOptions,
  actorLabel,
  type SessionClaims,
} from './session';
export {
  CSRF_COOKIE,
  CSRF_HEADER,
  issueCsrfToken,
  type OriginVerdict,
} from './csrf';
export type { RateLimitDecision, RateLimitRule } from './rate-limit';
export type { AuditEvent, AuditSeverity } from './audit';
export { apiError } from './guard';
