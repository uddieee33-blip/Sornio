/**
 * Violation reports.
 *
 * Where the browser sends a Content-Security-Policy violation — and the only
 * endpoint in DukaanOS that accepts an unauthenticated POST, because that is
 * what a report *is*: the browser telling us a page did something the policy
 * forbade, with no session and no CSRF token to offer.
 *
 * That makes it the one place where "collect everything, decide later" would
 * be genuinely dangerous, so it does the opposite:
 *
 *   • **It stores nothing.** Reports are classified into a bounded in-memory
 *     counter and dropped. There is no database table, no log file, no
 *     forwarding to a third party. A violation is a signal that *our* policy
 *     or *our* app is wrong — it is not telemetry about an owner's browser,
 *     and treating it as telemetry would make this endpoint a tracking pixel
 *     that we aimed at ourselves.
 *   • **It is bounded.** The body is read with a hard byte cap, the classifier
 *     keeps at most a few dozen distinct directives, and the whole thing lives
 *     behind its own rate-limit bucket (`policy.json → rateLimits.report`).
 *   • **It is redacted.** Only the directive name and a coarse scheme-level
 *     description of the blocked URI survive classification. A blocked URI can
 *     contain a full path with a customer id in it; that is exactly the kind
 *     of thing that should never be written down because it was "just a
 *     security log".
 *   • **It always answers 204.** A reporting endpoint that returns errors
 *     teaches a browser to retry, and teaches an attacker which payloads are
 *     interesting. It accepts, it says nothing, it moves on.
 */

import { NextResponse } from 'next/server';

/** Hard cap on the body we will even read. Reports are small; floods are not. */
const MAX_BYTES = 16 * 1024;

/** Distinct directives tracked. Beyond this the counter stops growing. */
const MAX_TRACKED_DIRECTIVES = 40;

const counts = new Map<string, { n: number; lastAt: number }>();

/**
 * Reduce a blocked URI to something that cannot identify anybody.
 *
 * `https://evil.example/steal?token=abc` becomes `https://evil.example`.
 * `data:text/html;base64,…` becomes `data:`. A same-origin path becomes
 * `self`. That is enough to answer "what kind of thing was blocked", which is
 * the only question a violation report needs to answer.
 */
function coarse(uri: unknown): string {
  if (typeof uri !== 'string' || !uri) return 'unknown';
  if (uri === 'self' || uri.startsWith('/')) return 'self';
  if (uri.startsWith('inline') || uri.startsWith('eval')) return uri.split(/\s/)[0];
  const scheme = uri.split(':')[0]?.toLowerCase() ?? '';
  if (['data', 'blob', 'filesystem', 'about', 'chrome-extension', 'moz-extension'].includes(scheme)) {
    return `${scheme}:`;
  }
  try {
    return new URL(uri).origin;
  } catch {
    return scheme ? `${scheme}:` : 'unknown';
  }
}

function classify(report: Record<string, unknown>): string {
  const directive =
    report['effective-directive'] ?? report['effectiveDirective'] ?? report['violated-directive'] ?? 'unknown';
  const blocked = report['blocked-uri'] ?? report['blockedURL'] ?? report['blockedURI'];
  return `${String(directive).split(/\s/)[0].slice(0, 40)} ← ${coarse(blocked).slice(0, 80)}`;
}

function record(key: string) {
  const existing = counts.get(key);
  if (existing) {
    existing.n += 1;
    existing.lastAt = Date.now();
    return;
  }
  if (counts.size >= MAX_TRACKED_DIRECTIVES) return;
  counts.set(key, { n: 1, lastAt: Date.now() });
}

/** Always 204, always no-store, never a body. */
function accepted(): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('cache-control', 'no-store');
  return response;
}

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get('content-length') ?? '0');
    if (length > MAX_BYTES) return accepted();

    const text = (await request.text()).slice(0, MAX_BYTES);
    if (!text) return accepted();

    const parsed = JSON.parse(text) as unknown;

    // Two wire formats exist and both are in the wild: the legacy
    // `{ "csp-report": {…} }` from `report-uri`, and the array of
    // `{ type, body }` envelopes from the Reporting API / `report-to`.
    const reports: Record<string, unknown>[] = Array.isArray(parsed)
      ? parsed
          .map((entry) => (entry as { body?: unknown }).body)
          .filter((body): body is Record<string, unknown> => typeof body === 'object' && body !== null)
      : typeof (parsed as { 'csp-report'?: unknown })['csp-report'] === 'object'
        ? [(parsed as { 'csp-report': Record<string, unknown> })['csp-report']]
        : [parsed as Record<string, unknown>];

    for (const report of reports.slice(0, 10)) record(classify(report));
  } catch {
    // A malformed report is still a report. Swallow it: this endpoint must
    // never become a way to find out what our parser does not like.
  }
  return accepted();
}

/**
 * What has been seen since this instance started.
 *
 * Read by the Trust Centre so an owner can see that the policy is not merely
 * configured but *holding* — zero violations is a fact worth showing. The
 * response is counts only; nothing here can identify a person, a page or a
 * request.
 */
export async function GET() {
  const summary = Array.from(counts.entries())
    .map(([kind, value]) => ({ kind, count: value.n, lastAt: value.lastAt }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const response = NextResponse.json({
    ok: true,
    total: summary.reduce((sum, entry) => sum + entry.count, 0),
    kinds: summary,
    note: 'Counts only, held in memory, reset on deploy. No report body is stored.',
  });
  response.headers.set('cache-control', 'no-store');
  return response;
}

export const dynamic = 'force-dynamic';
