/**
 * Sliding-window rate limiter.
 *
 * Runs in Edge middleware with zero dependencies. Buckets are keyed by
 * `scope + client fingerprint`, so a noisy tab, a scraper, and a brute-force
 * login attempt are all throttled independently.
 *
 * Honest about its limits: the store is in-process memory, which is exactly
 * right for a single-region deployment and a documented upgrade point
 * (`RateLimitStore`) for anything multi-instance — swap the Map for Redis
 * without touching the call sites.
 */

export type RateLimitRule = { limit: number; windowMs: number };

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window frees up — emitted as `Retry-After`. */
  retryAfter: number;
  resetAt: number;
};

export interface RateLimitStore {
  hit(key: string, windowMs: number, now: number): number[];
  sweep(now: number): void;
}

/** Default store: a bounded Map of timestamp arrays. */
export class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, number[]>();
  private lastSweep = 0;
  private readonly maxKeys: number;

  constructor(maxKeys = 5000) {
    this.maxKeys = maxKeys;
  }

  hit(key: string, windowMs: number, now: number): number[] {
    const existing = this.buckets.get(key) ?? [];
    const fresh = existing.filter((stamp) => now - stamp < windowMs);
    fresh.push(now);
    this.buckets.set(key, fresh);
    if (now - this.lastSweep > 30_000) this.sweep(now);
    return fresh;
  }

  sweep(now: number): void {
    this.lastSweep = now;
    for (const [key, stamps] of this.buckets) {
      const fresh = stamps.filter((stamp) => now - stamp < 5 * 60_000);
      if (fresh.length === 0) this.buckets.delete(key);
      else this.buckets.set(key, fresh);
    }
    // Hard bound: if a hostile client mints keys, drop the oldest entries.
    if (this.buckets.size > this.maxKeys) {
      const excess = this.buckets.size - this.maxKeys;
      let removed = 0;
      for (const key of this.buckets.keys()) {
        this.buckets.delete(key);
        if (++removed >= excess) break;
      }
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}

let store: RateLimitStore = new MemoryRateLimitStore();

/** Swap the backing store (Redis, Upstash, Durable Object, …). */
export function setRateLimitStore(next: RateLimitStore): void {
  store = next;
}

/**
 * Build a stable-but-rotating client fingerprint. We deliberately hash nothing
 * here: the limiter only needs collision resistance within a short window, and
 * we never persist the raw IP.
 */
export function clientFingerprint(input: {
  ip?: string | null;
  userAgent?: string | null;
  sessionHint?: string | null;
}): string {
  const ip = (input.ip ?? 'unknown').split(',')[0].trim();
  const ua = (input.userAgent ?? 'unknown').slice(0, 80);
  const session = (input.sessionHint ?? 'anon').slice(0, 40);
  return `${ip}|${ua}|${session}`;
}

export function consume(
  key: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): RateLimitDecision {
  const stamps = store.hit(key, rule.windowMs, now);
  const used = stamps.length;
  const oldest = stamps[0] ?? now;
  const resetAt = oldest + rule.windowMs;
  const allowed = used <= rule.limit;
  return {
    allowed,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - used),
    retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    resetAt,
  };
}

/** Which rule applies to a path, given the policy table. */
export function ruleForPath(
  pathname: string,
  table: Record<string, RateLimitRule>,
): { scope: string; rule: RateLimitRule } {
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/auth')) {
    return { scope: 'auth', rule: table.auth };
  }
  // Portal switching reshapes the whole console: it gets its own tight bucket
  // rather than sharing the general API budget.
  if (pathname.startsWith('/api/portal')) {
    return { scope: 'portal', rule: table.portal };
  }
  // Redeeming an invite code is a credential attempt in every meaningful
  // sense — an 8-symbol secret, guessable only by asking the server. It draws
  // on the same tight budget as the sign-in form, not on the team's own.
  if (pathname.startsWith('/api/team/redeem')) {
    return { scope: 'auth', rule: table.auth };
  }
  // Invites, removals and role changes are rare in a busy shop and constant
  // for a script enumerating endpoints; their own bucket keeps it that way.
  if (pathname.startsWith('/api/team')) {
    return { scope: 'team', rule: table.team };
  }
  // Plans are money: their own bucket, tighter than the portal's, so guessing
  // activation codes or hammering the endpoint costs far more than it is worth.
  if (pathname.startsWith('/api/subscription') || pathname.startsWith('/api/platform/keys')) {
    return { scope: 'plan', rule: table.plan };
  }
  // Everything On is a switch an owner flips twice a year and a script would
  // flip continuously. Six a minute is generous for the first and useless for
  // the second.
  if (pathname.startsWith('/api/master')) {
    return { scope: 'master', rule: table.master };
  }
  // The owner profile carries the collection UPI id — the address the shop's
  // money lands at — so a write to it is money-adjacent and gets its own bucket.
  // Twenty a minute is generous for an owner saving a setup screen and useless
  // to a script rewriting a payee address in a loop. Reads are unaffected: the
  // edge routes GETs on any /api path to the apiRead bucket before this.
  if (pathname.startsWith('/api/profile')) {
    return { scope: 'profile', rule: table.profile };
  }
  // Violation reports arrive from the browser, unauthenticated, and a hostile
  // page can aim a browser at this endpoint. Its own bucket keeps a report
  // flood from eating the budget the console needs to work.
  if (pathname.startsWith('/api/report')) {
    return { scope: 'report', rule: table.report };
  }
  if (pathname.startsWith('/api')) {
    return { scope: 'api', rule: table.api };
  }
  if (pathname.startsWith('/reports') || pathname.includes('export')) {
    return { scope: 'reports', rule: table.reports };
  }
  return { scope: 'page', rule: table.page };
}

/** Headers a good citizen sends back when throttling. */
export function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(decision.limit),
    'X-RateLimit-Remaining': String(decision.remaining),
    'X-RateLimit-Reset': String(Math.ceil(decision.resetAt / 1000)),
  };
}

/* -------------------------------------------------------------------------- */
/*  The penalty box                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A sliding window answers "how fast?". It does not answer "is this a shop or
 * a script?".
 *
 * A shop that gets busy hits its limit once, reads the `Retry-After`, and
 * slows down. A script hits the limit, gets a 429, and immediately tries
 * again — which under a pure sliding window costs the attacker nothing and
 * costs us a full request's worth of work every time, forever.
 *
 * So throttles are counted. Four of them inside five minutes and the
 * fingerprint goes into a penalty box: every request is refused up front,
 * before the window arithmetic, before the cookie parsing, before anything.
 * The penalty doubles on each subsequent trip and is capped at thirty minutes,
 * so a persistent attacker converges on one request per half hour while the
 * cost to us converges on a map lookup.
 *
 * A human cannot earn four throttles in five minutes at these budgets (300
 * page requests a minute), which is the test for whether a control like this
 * is safe to ship: it has to be unreachable by accident.
 */
export type AbuseRule = {
  strikesBeforePenalty: number;
  penaltyMs: number;
  maxPenaltyMs: number;
  strikeWindowMs: number;
};

type Strike = { count: number; firstAt: number; until: number; penaltyMs: number };

const strikes = new Map<string, Strike>();
const MAX_TRACKED = 5000;

function sweepStrikes(now: number) {
  if (strikes.size <= MAX_TRACKED) return;
  for (const [key, strike] of strikes) {
    if (now > strike.until && now - strike.firstAt > strike.penaltyMs * 2) strikes.delete(key);
    if (strikes.size <= MAX_TRACKED) break;
  }
}

/** Is this fingerprint currently serving a penalty? Cheap: one map read. */
export function penaltyRemainingMs(fingerprint: string, now: number = Date.now()): number {
  const strike = strikes.get(fingerprint);
  if (!strike || now >= strike.until) return 0;
  return strike.until - now;
}

/**
 * Record a throttle. Returns the penalty now in force, in milliseconds (0 when
 * the client is still below the strike threshold and is only being slowed).
 */
export function recordThrottle(
  fingerprint: string,
  rule: AbuseRule,
  now: number = Date.now(),
): number {
  const existing = strikes.get(fingerprint);

  // A strike window that has fully elapsed means the client behaved for long
  // enough to deserve a clean slate. Forgiveness is not generosity here — it
  // is what keeps a shared shop IP from accumulating strikes over a month.
  if (!existing || now - existing.firstAt > rule.strikeWindowMs) {
    strikes.set(fingerprint, { count: 1, firstAt: now, until: 0, penaltyMs: rule.penaltyMs });
    sweepStrikes(now);
    return 0;
  }

  existing.count += 1;

  if (existing.count >= rule.strikesBeforePenalty) {
    // Double on each trip past the threshold, capped.
    const penalty = existing.until > 0 ? Math.min(existing.penaltyMs * 2, rule.maxPenaltyMs) : rule.penaltyMs;
    existing.penaltyMs = penalty;
    existing.until = now + penalty;
    existing.count = 0;
    existing.firstAt = now;
    strikes.set(fingerprint, existing);
    sweepStrikes(now);
    return penalty;
  }

  strikes.set(fingerprint, existing);
  return 0;
}

/** Wipe the penalty state. Exists for the verifier, not for the running app. */
export function resetAbuseState(): void {
  strikes.clear();
}
