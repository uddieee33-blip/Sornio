/**
 * Plan endpoint.
 *
 * The single place a plan can change, and it is written to be the *only* thing
 * an attacker would have to get past — which is why everything it does is a
 * refusal by default:
 *
 *   GET   → reports the plan this device is on (signed cookie, verified).
 *   POST  → one of five actions, each validated server-side:
 *             start-trial        once per device/tenant, never again
 *             choose-plan        the free plan only — always allowed, it is a downgrade
 *             request-activation a *request*: it grants nothing, it returns instructions
 *             activate           a signed, single-purpose activation code → a paid plan
 *             refresh            re-derives the record; a paid plan is kept only if still in period
 *
 * Hardening that applies to every request (inherited from `middleware.ts`,
 * restated here so a refactor cannot quietly drop it):
 *
 *   • CSRF — `x-csrf-token` must match the `dukaan.csrf` cookie (double submit),
 *     on top of the origin and fetch-metadata checks.
 *   • Rate limit — `/api/subscription` has its own bucket (`policy.json →
 *     rateLimits.plan`), tight enough that guessing activation codes is
 *     pointless even before the 256-bit HMAC makes it impossible.
 *   • Validation — plan ids come from the shipped catalogue; a plan id of
 *     `trial` or `growth` in a *choose* action is refused, because only the
 *     trial action may start a trial, and only a verified code may grant a paid
 *     plan. The server never echoes client input into the cookie.
 *   • Authorisation — with real Supabase credentials and a signed-in user, the
 *     user must hold an owner/manager role. In local-first mode the console runs
 *     on the owner's own device, which is stated plainly in the README rather
 *     than dressed up as DRM.
 *   • The cookie is httpOnly, SameSite=Lax, and signed with the deployment's
 *     session secret, so no script (and no other site) can rewrite a plan.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, openOwnerSession, sealOwnerSession, ownerSessionCookie, actorNameFor } from '@/lib/auth';
import { appRoleForMembership } from '@/lib/team/roles';
import { SESSION_IDLE_SECONDS } from '@/lib/security/session';

import { getGuardedServerClient, getSessionUser } from '@/lib/security/guard';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { sessionSecretConfigError, sessionVerificationSecret } from '@/lib/security/session';
import { transportForRequest } from '@/lib/security/transport';
import type { CookieTransport } from '@/lib/security/cookies';
import { sha256Hex, randomToken } from '@/lib/security/crypto';
import { isValidUpiId } from '@/lib/upi';
import {
  PLAN_COOKIE,
  TRIAL_DAYS,
  freeRecord,
  isActivationConfigured,
  isPlanId,
  openPlanRecord,
  planById,
  planCookieOptions,
  recordFromActivation,
  sealPlanRecord,
  verifyActivationCode,
  type PaidPlanId,
  type PlanRecord,
} from '@/lib/plans';

const DAY_SECONDS = 86_400;

/** Role names that may change what the business pays for. */
const PLAN_ADMIN_ROLES = new Set(['owner', 'manager']);

function json(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  return response;
}

async function currentRecord(): Promise<PlanRecord | null> {
  if (isSupabaseConfigured()) {
    const user = await getSessionUser();
    if (!user) return null;
    const client = await getGuardedServerClient();
    const result = await client!.rpc('read_business_plan');
    if (result.error) throw new Error('Plan storage unavailable');
    return result.data as PlanRecord | null;
  }
  const store = await cookies();
  return openPlanRecord(store.get(PLAN_COOKIE)?.value);
}

/**
 * Authorisation when a real session exists.
 *
 * The role lives in `business_members` (see `supabase/schema.sql`); anything we
 * cannot resolve is treated as "not an owner" rather than assumed. When the
 * deployment has no Supabase configured there is no session to consult and no
 * server-side tenant to protect — the record can only ever affect this
 * device's own console, and the README says so in as many words.
 */
async function mayManagePlan(userId: string): Promise<boolean> {
  try {
    const { getGuardedServerClient } = await import('@/lib/security/guard');
    const client = await getGuardedServerClient();
    if (!client) return false;
    // The RPC resolves auth.uid(), returns an existing seat unchanged and
    // creates an owner seat only for an account starting its own business.
    const user = await getSessionUser();
    if (user?.id !== userId) return false;
    const { data, error } = await client.rpc('ensure_owner_business');
    if (error || !data) return false;
    return PLAN_ADMIN_ROLES.has(String(data.role));
  } catch {
    return false;
  }
}

async function requiresOwner(): Promise<NextResponse | null> {
  if (!isSupabaseConfigured()) return null;
  const user = await getSessionUser();
  if (!user) return json({ error: 'Sign-in required to change your plan.' }, 401);
  const allowed = await mayManagePlan(user.id);
  if (!allowed) return json({ error: 'Your role cannot change the plan. Ask the owner or a manager.' }, 403);
  return null;
}

function withRecord(record: PlanRecord, body: Record<string, unknown> = {}, status = 200): NextResponse {
  const response = json({ ok: true, record, ...body }, status);
  return response;
}

async function issue(
  record: PlanRecord,
  transport: CookieTransport,
  body: Record<string, unknown> = {},
): Promise<NextResponse> {
  // The plan cookie is signed with the same key as the session. Without a
  // usable one there is nothing to seal it with — say so rather than letting
  // the throw surface as a bare 500.
  if (sessionVerificationSecret() === null) {
    return json({ ok: false, code: 'sessions-disabled', error: sessionSecretConfigError() }, 503);
  }
  let scope: { businessId: string; role: string } | null = null;
  if (isSupabaseConfigured()) {
    const client = await getGuardedServerClient();
    const { data, error } = await client!.rpc('ensure_owner_business');
    if (error) return json({ error: 'Could not reach the server. Check your connection and try again — nothing was lost.' }, 503);
    scope = data;
    record = { ...record, businessId: data.businessId };
  }
  const token = await sealPlanRecord(record);
  const response = withRecord(record, body);
  response.cookies.set(PLAN_COOKIE, token, planCookieOptions(transport));
  if (scope) {
    const store = await cookies();
    const prior = await openOwnerSession(store.get(AUTH_COOKIE)?.value);
    const role = appRoleForMembership(scope.role);
    if (prior?.tenantId !== scope.businessId || prior.role !== role) {
      const user = await getSessionUser();
      if (!user) return json({ error: 'Sign-in required to change your plan.' }, 401);
      const renewed = await sealOwnerSession({ userId: user.id, tenantId: scope.businessId, role, displayName: actorNameFor(user.email), remember: prior ? prior.exp - prior.iat > SESSION_IDLE_SECONDS : true });
      response.cookies.set(AUTH_COOKIE, renewed.value, ownerSessionCookie(transport, renewed.maxAge));
    }
  }
  return response;
}

/** GET — report, never mutate. */
export async function GET(request: Request) {
  try {
    const record = await currentRecord();
    return record ? issue(record, transportForRequest(request)) : json({ ok: true, record });
  } catch {
    return json({ error: 'Could not reach the server. Check your connection and try again — nothing was lost.' }, 503);
  }
}

export async function POST(request: Request) {
  const transport = transportForRequest(request);
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  const action = (payload as { action?: unknown } | null)?.action;
  if (typeof action !== 'string') return json({ error: 'Missing action.' }, 422);

  let record: PlanRecord | null;
  try { record = await currentRecord(); }
  catch { return json({ error: 'Could not reach the server. Check your connection and try again — nothing was lost.' }, 503); }
  if (isSupabaseConfigured() && ['start-trial', 'choose-plan', 'activate'].includes(action)) {
    const denial = await requiresOwner();
    if (denial) return denial;
    if (action === 'choose-plan' && (payload as { planId?: unknown }).planId !== 'starter')
      return json({ error: 'Only the free plan can be chosen directly. Pick a paid plan to get payment details.' }, 422);
    const code = (payload as { code?: unknown }).code;
    if (action === 'activate' && (typeof code !== 'string' || !/^DKK1-[a-f0-9]{64}$/.test(code.trim())))
      return json({ error: 'That activation code is not valid. Check the code, or ask us to re-send it.' }, 422);
    const client = await getGuardedServerClient();
    const result = await client!.rpc('change_business_plan', {
      p_action: action,
      p_code_hash: action === 'activate' ? await sha256Hex((code as string).trim()) : null,
    });
    if (result.error) {
      const duplicate = result.error.code === '23505';
      return json({ error: duplicate ? 'Your trial is already running.' : 'That activation code is not valid. Check the code, or ask us to re-send it.' }, duplicate ? 409 : result.error.code === '42501' ? 403 : 422);
    }
    return issue(result.data as PlanRecord, transport, { changed: true });
  }
  const now = Date.now();
  const nowSeconds = Math.floor(now / 1000);

  switch (action) {
    case 'refresh': {
      // A plan is never *extended* here: the record is re-signed as-is, which
      // rewrites nothing but the cookie's own lifetime.
      return issue(record ?? freeRecord(now), transport, { changed: false });
    }

    case 'start-trial': {
      const denial = await requiresOwner();
      if (denial) return denial;
      if (record?.planId === 'trial' && record.trialEndsAt > nowSeconds) {
        return json({ error: 'Your trial is already running.', record }, 409);
      }
      if (record?.trialUsedAt) {
        return json({ error: 'This device has already used its full trial — you experienced every module and every feature. Pick a plan to keep them all.' }, 409);
      }
      if (record && record.planId !== 'starter' && record.renewsAt > nowSeconds) {
        return json({ error: `Your ${planById(record.planId).name} plan is active — you do not need a trial.` }, 409);
      }
      const trial: PlanRecord = {
        planId: 'trial',
        since: nowSeconds,
        renewsAt: 0,
        trialEndsAt: nowSeconds + TRIAL_DAYS * DAY_SECONDS,
        activatedBy: 'self',
        trialUsedAt: nowSeconds,
      };
      return issue(trial, transport, { changed: true, message: `Full trial started — every module, every feature, every limit removed for ${TRIAL_DAYS} days. Experience the complete console.` });
    }

    case 'choose-plan': {
      const denial = await requiresOwner();
      if (denial) return denial;
      const planId = (payload as { planId?: unknown } | null)?.planId;
      // Only the free plan can be chosen directly. Anything else needs money
      // and a code; a client cannot talk itself into a paid plan.
      if (planId !== 'starter') {
        return json({ error: 'Only the free plan can be chosen directly. Pick a paid plan to get payment details.' }, 422);
      }
      const starter: PlanRecord = {
        planId: 'starter',
        since: record?.since || nowSeconds,
        renewsAt: 0,
        trialEndsAt: 0,
        activatedBy: 'self',
        trialUsedAt: record?.trialUsedAt,
      };
      return issue(starter, transport, { changed: true, message: 'You are on the free plan. Everything you recorded is untouched.' });
    }

    case 'request-activation': {
      const denial = await requiresOwner();
      if (denial) return denial;
      const planId = (payload as { planId?: unknown } | null)?.planId;
      const interval = (payload as { interval?: unknown } | null)?.interval;
      if (!isPlanId(planId) || planId === 'trial' || planId === 'starter') {
        return json({ error: 'Choose a paid plan to continue.' }, 422);
      }
      const plan = planById(planId);
      const price =
        plan.prices.find((entry) => entry.interval === interval) ??
        plan.prices.find((entry) => entry.interval === 'month') ??
        plan.prices[0];
      if (!price || price.amount <= 0) return json({ error: 'That plan has no payable period.' }, 422);

      // Reference ties the money to the plan in both directions: the owner
      // quotes it when they pay, support sees it when the code is minted.
      const reference = `DK${planId === 'growth' ? 'G' : planId === 'scale' ? 'S' : 'F'}-${randomToken(3).toUpperCase()}`;
      // The payee is the *deployment's* UPI, read server-side from the
      // environment — never a value the browser can set, because a payee that
      // can be edited in devtools is a payee that can be pointed at someone
      // else. A VPA that does not look like a VPA is treated as not configured
      // rather than shipped into a QR that sends money nowhere.
      const configuredUpi = (process.env.NEXT_PUBLIC_PLANS_UPI_ID ?? '').trim();
      const upiId = isValidUpiId(configuredUpi) ? configuredUpi : null;
      const payeeName = (process.env.NEXT_PUBLIC_PLANS_PAYEE_NAME ?? '').trim() || null;
      const support = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '').replace(/[^\d]/g, '') || null;
      const misconfiguredUpi = configuredUpi && !upiId ? configuredUpi : null;

      const params = new URLSearchParams({
        pa: upiId ?? '',
        pn: payeeName ?? 'Sornio',
        am: String(price.amount),
        cu: 'INR',
        tn: `Sornio ${plan.name} ${price.months}mo ${reference}`,
      });
      const upiIntent = upiId ? `upi://pay?${params.toString()}` : null;
      const ownerClient = await getGuardedServerClient();
      const ownerScope = ownerClient ? await ownerClient.rpc('ensure_owner_business') : null;
      const businessId = ownerScope?.data?.businessId ?? null;
      const whatsappHref = support
        ? `https://wa.me/${support}?text=${encodeURIComponent(
            `I have paid for Sornio ${plan.name} (${price.months} month(s)). Business: ${businessId ?? 'local device'}. Reference: ${reference}. Amount: ₹${price.amount}. Please activate my plan.`,
          )}`
        : null;

      return json({
        ok: true,
        record,
        payment: {
          reference,
          businessId,
          months: price.months,
          amount: price.amount,
          interval: price.interval,
          planName: plan.name,
          upiId,
          payeeName,
          upiIntent,
          whatsappHref,
          // Whether money can actually be collected right now, said plainly so
          // the owner is never asked to pay an address that does not exist.
          configured: Boolean(upiId),
          setupHint: upiId
            ? null
            : misconfiguredUpi
              ? `NEXT_PUBLIC_PLANS_UPI_ID is set to "${misconfiguredUpi}", which is not a valid UPI id (it should look like name@bank). Fix it on the server before collecting plan payments.`
              : 'NEXT_PUBLIC_PLANS_UPI_ID is not set on this deployment, so no payment can be collected online yet. Set it (and NEXT_PUBLIC_PLANS_PAYEE_NAME + NEXT_PUBLIC_SUPPORT_WHATSAPP) on the server.',
        },
        message: upiId
          ? 'Pay with any UPI app — scan the QR or tap the button — then paste the activation code we send you.'
          : 'Checkout preview only. Payments are not open yet; no plan has been activated.',
      });
    }

    case 'activate': {
      const denial = await requiresOwner();
      if (denial) return denial;
      if (!isActivationConfigured()) {
        return json(
          {
            error:
              'Activation is not enabled on this deployment. Set DUKAANOS_ACTIVATION_SECRET on the server, or use the hosted service.',
          },
          503,
        );
      }
      const code = (payload as { code?: unknown } | null)?.code;
      const verdict = await verifyActivationCode(typeof code === 'string' ? code : null);
      if (!verdict.valid) {
        // One vague answer for every failure: a guesser learns nothing.
        return json({ error: 'That activation code is not valid. Check the code, or ask us to re-send it.' }, 422);
      }
      const next = recordFromActivation(record, verdict.planId as PaidPlanId, verdict.months, verdict.reference, now);
      return issue(next as PlanRecord, transport, {
        changed: true,
        message: `${planById(next.planId).name} activated until ${new Date(next.renewsAt * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.`,
      });
    }

    default:
      return json({ error: 'Unknown action.' }, 422);
  }
}

/** The plan must reflect the cookie on every request — never a cached body. */
export const dynamic = 'force-dynamic';
