'use client';

/**
 * Client for the single server endpoint that can change a plan.
 *
 * `POST /api/subscription` is the only place a plan is granted, and it is
 * hardened the same way `/api/portal` is: CSRF double-submit token, its own
 * tight rate-limit bucket, an owner/manager role check when a real session
 * exists, and server-side validation of everything in the body. This module
 * only *asks*; it never decides.
 *
 * Failure is never fatal. If the request cannot be made (offline, throttled, a
 * preview host), the console keeps working on the free entitlement it already
 * published, and the owner is told to try again — the shop must not stop
 * because a settings call did.
 */

import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/security/csrf';
import { isPlanId } from './catalogue';
import type { PaidPlanId, PlanRecord } from './types';

export type PlanAction =
  | { action: 'start-trial' }
  | { action: 'choose-plan'; planId: 'starter' }
  | { action: 'request-activation'; planId: PaidPlanId; interval: string }
  | { action: 'activate'; code: string }
  | { action: 'refresh' };

export type PaymentInstructions = {
  reference: string;
  amount: number;
  interval: string;
  planName: string;
  /** Payee UPI id, when the deployment configured one. */
  upiId: string | null;
  payeeName: string | null;
  /** `upi://pay?...` intent — opens any UPI app on the phone. */
  upiIntent: string | null;
  /** Support channel, so "I have paid" is one tap away. */
  whatsappHref: string | null;
};

export type PlanResponse = {
  ok: boolean;
  error?: string;
  record?: PlanRecord | null;
  payment?: PaymentInstructions;
};

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * The amount a payment request is for: the chosen interval's price, falling
 * back to the plan's cheapest paid period. Computed for display and for the
 * UPI intent; the authoritative amount lives in the plan catalogue, and the
 * activation code carries the months that were actually paid for.
 */
export async function fetchPlan(): Promise<PlanResponse> {
  if (typeof window === 'undefined') return { ok: false, error: 'Not in a browser.' };
  try {
    const response = await fetch('/api/subscription', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return { ok: false, error: `Plan could not be read (${response.status}).` };
    const payload = (await response.json().catch(() => ({}))) as { record?: unknown };
    const record = normalizeRecord(payload.record);
    return { ok: true, record };
  } catch {
    return { ok: false, error: 'Plan could not be read — you are offline. The console keeps working.' };
  }
}

export async function postPlan(action: PlanAction): Promise<PlanResponse> {
  if (typeof window === 'undefined') return { ok: false, error: 'Not in a browser.' };

  const send = async (token: string | null): Promise<PlanResponse> => {
    const response = await fetch('/api/subscription', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        ...(token ? { [CSRF_HEADER]: token } : {}),
      },
      body: JSON.stringify(action),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      record?: unknown;
      payment?: PaymentInstructions;
    };
    if (!response.ok) {
      return { ok: false, error: payload.error ?? `That could not be saved (${response.status}).`, payment: payload.payment };
    }
    return { ok: true, record: normalizeRecord(payload.record), payment: payload.payment };
  };

  try {
    let token = readCookie(CSRF_COOKIE);
    if (!token) {
      await fetch('/api/subscription', { method: 'GET', credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
      token = readCookie(CSRF_COOKIE);
    }
    const result = await send(token);
    if (!result.ok && token && result.error?.includes('token')) {
      // The CSRF cookie may have rotated; refresh it and retry exactly once.
      await fetch('/api/subscription', { method: 'GET', credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
      return send(readCookie(CSRF_COOKIE));
    }
    return result;
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again — nothing was lost.' };
  }
}

/** Structural guard: a plan record from the network is untrusted input. */
export function normalizeRecord(value: unknown): PlanRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PlanRecord>;
  if (!isPlanId(candidate.planId)) return null;
  const num = (input: unknown) => (typeof input === 'number' && Number.isFinite(input) ? input : 0);
  return {
    planId: candidate.planId,
    since: num(candidate.since),
    renewsAt: num(candidate.renewsAt),
    trialEndsAt: num(candidate.trialEndsAt),
    trialUsedAt: num(candidate.trialUsedAt) || undefined,
    priceLockedUntil: num(candidate.priceLockedUntil) || undefined,
    activatedBy: candidate.activatedBy ?? 'self',
    reference: typeof candidate.reference === 'string' ? candidate.reference : undefined,
  };
}
