/**
 * `GET /api/health` — what this deployment is actually configured with.
 *
 * Every setting in DukaanOS that matters is a server-side environment variable:
 * the platform's own UPI id, the two secrets that sign sessions and activation
 * codes, the Supabase keys. That is deliberate — a value a browser can rewrite
 * is a value anybody can rewrite — but it leaves the owner of a fresh install
 * staring at a payment screen that says "not configured" with nowhere to look.
 * This endpoint is that "somewhere": the console's Settings page reads it and
 * shows the real state, per variable, for *this* deployment.
 *
 * The rules this endpoint follows, in order of importance:
 *
 *   1. **No secret value is ever returned.** A public setting (a UPI id, a
 *      WhatsApp number, a Supabase URL — all of which customers already see) is
 *      reported as set, and shown only to help the owner spot their own typo. A
 *      server secret is reported as set or missing, plus its length. Never the
 *      value, never a hash of it, never a prefix.
 *   2. **No answer depends on being signed in.** The variables it reports are
 *      the deployment's, not a tenant's, and an owner whose plan has lapsed
 *      still needs to know why their payment cannot go through. It leaks nothing
 *      about any business.
 *   3. **A malformed value is reported as malformed.** "Set but wrong" is the
 *      failure that wastes an owner's afternoon, so the format checks here are
 *      the same ones the runtime uses (`isValidUpiId`, the Supabase validator,
 *      the activation secret's minimum length).
 *
 * The response is a plain report: `problems` is written to be read out loud, and
 * an empty list means everything this deployment needs is in place.
 */

import { NextResponse } from 'next/server';

import { isActivationConfigured } from '@/lib/plans';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { resolvePosture } from '@/lib/security/headers';
import { SESSION_SECRET_MIN_LENGTH as SECRET_MIN_LENGTH, sessionSecretState } from '@/lib/security/session';
import { isValidUpiId } from '@/lib/upi';

export type EnvVarStatus = {
  key: string;
  label: string;
  scope: 'public' | 'server';
  required: boolean;
  configured: boolean;
  /** A sentence about the real state, or null when there is nothing to report. */
  detail: string | null;
  /** What the owner sees when it is missing. */
  surface: string;
  hint: string;
  format: string;
};

function secretStatus(
  key: string,
  label: string,
  value: string,
  hint: string,
  surface: string,
): EnvVarStatus {
  const trimmed = value.trim();
  const longEnough = trimmed.length >= SECRET_MIN_LENGTH;
  return {
    key,
    label,
    scope: 'server',
    required: true,
    configured: trimmed.length > 0 && longEnough,
    detail:
      trimmed.length === 0
        ? null
        : longEnough
          ? 'Set. The value itself is never sent to a browser, including this one.'
          : `Set, but too short. It must be at least ${SECRET_MIN_LENGTH} characters.`,
    surface,
    hint,
    format: `at least ${SECRET_MIN_LENGTH} characters — openssl rand -hex 32`,
  };
}

export async function GET() {
  const plansUpi = (process.env.NEXT_PUBLIC_PLANS_UPI_ID ?? '').trim();
  const plansUpiValid = isValidUpiId(plansUpi);
  const payeeName = (process.env.NEXT_PUBLIC_PLANS_PAYEE_NAME ?? '').trim();
  const support = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '').trim();
  const supabaseConfigured = isSupabaseConfigured();
  const sessionSecret = (process.env.DUKAANOS_SESSION_SECRET ?? '').trim();
  const activationSecret = (process.env.DUKAANOS_ACTIVATION_SECRET ?? '').trim();

  const vars: EnvVarStatus[] = [
    {
      key: 'NEXT_PUBLIC_PLANS_UPI_ID',
      label: 'The platform’s own UPI id — where plan payments arrive',
      scope: 'public',
      required: false,
      configured: plansUpiValid,
      detail:
        plansUpi.length === 0
          ? 'Not set, so plan money cannot be collected online: Your Plan shows the amount and the reference, but there is no QR to pay.'
          : plansUpiValid
            ? `Set to ${plansUpi}. This is an address, not a secret — it is exactly what a payer sees on a QR code.`
            : `Set to “${plansUpi}”, which is not a valid UPI id. It must look like name@bank, or Your Plan will refuse to show a payment QR.`,
      surface: 'Your Plan says “Online payment is not switched on for this deployment yet”.',
      hint: 'The VPA that receives the plan prices. Read server-side and validated with the same NPCI check the customer QRs use.',
      format: 'name@bank — e.g. yourbusiness@okhdfcbank',
    },
    {
      key: 'NEXT_PUBLIC_PLANS_PAYEE_NAME',
      label: 'The name the payer sees in their UPI app',
      scope: 'public',
      required: false,
      configured: payeeName.length > 0,
      detail: payeeName.length > 0
        ? `Set to ${payeeName}. This is what appears next to the amount in the paying app.`
        : 'Not set — the QR falls back to showing “DukaanOS”. Set your own name so a payer recognises who they are paying.',
      surface: 'Falls back to “DukaanOS” on the payment QR.',
      hint: 'A recognisable payee name is the difference between a completed payment and an abandoned one.',
      format: 'Plain text — e.g. DukaanOS, or your registered business name',
    },
    {
      key: 'NEXT_PUBLIC_SUPPORT_WHATSAPP',
      label: 'The number that answers “I have paid”',
      scope: 'public',
      required: false,
      configured: support.replace(/[^\d]/g, '').length >= 10,
      detail: support.length > 0
        ? `Set to ${support}. Your Plan offers one tap to WhatsApp with the reference already filled in.`
        : 'Not set — after paying, an owner has no button to send you the reference, so activation depends on them finding another channel.',
      surface: 'The “Send us the reference on WhatsApp” step is hidden.',
      hint: 'Where an owner sends the payment reference so you can mint their activation code.',
      format: 'country code + number, digits only — e.g. 919876543210',
    },
    secretStatus(
      'DUKAANOS_SESSION_SECRET',
      'Signs sessions and the plan cookie',
      sessionSecret,
      'With it set, a session token or a plan record cannot be forged by editing browser storage. Production refuses to mint or verify sessions without it; local development falls back to a per-host key so `next dev` still works.',
      'Sign-in is refused with “This deployment cannot open sessions …” until this is set. A development build signs with a per-host fallback key instead.',
    ),
    secretStatus(
      'DUKAANOS_ACTIVATION_SECRET',
      'Signs activation codes — the bridge from “I paid” to “the plan is on”',
      activationSecret,
      'Server-only, so nobody can mint their own plan no matter what they change in devtools. With it unset, activation is disabled rather than guessable.',
      'Your Plan answers “Activation is not enabled on this deployment”, and no paid code can be redeemed.',
    ),
    {
      key: 'NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      label: 'Where the books are duplicated, and who may read them',
      scope: 'public',
      required: false,
      configured: supabaseConfigured,
      detail: supabaseConfigured
        ? 'Configured. The console syncs to your Supabase project, and the schema’s row-level security decides who may read which business.'
        : 'Not configured, so the console runs fully local-first: every record stays on this device, encrypted at rest, and nothing is sent anywhere. That is a legitimate way to run a shop — it just means one device, no second counter, and no server-side backup.',
      surface: 'Settings shows “Local demo mode”; the top bar offers no sync.',
      hint: 'Turns the local-first console into a multi-device one, with server-side tenants and backups (apply supabase/schema.sql first).',
      format: 'https://<project>.supabase.co and the anon/publishable key',
    },
  ];

  const problems: string[] = [];
  if (!plansUpiValid) {
    problems.push(
      plansUpi.length === 0
        ? 'NEXT_PUBLIC_PLANS_UPI_ID is not set, so no subscription payment can be collected yet. Your Plan will say so rather than showing a QR that leads nowhere.'
        : `NEXT_PUBLIC_PLANS_UPI_ID (“${plansUpi}”) is not a valid UPI id, so payment collection is refused. It should look like name@bank.`,
    );
  }
  const sessionState = sessionSecretState();
  if (sessionState === 'short') {
    problems.push('DUKAANOS_SESSION_SECRET is shorter than 32 characters. Generate one with openssl rand -hex 32.');
  }
  if (sessionState === 'missing') {
    problems.push(
      'DUKAANOS_SESSION_SECRET is not set, so this deployment cannot open or verify sessions: sign-in, account creation and password recovery all stop at a configuration error until it is. Generate one with openssl rand -hex 32 and set it in the host’s environment — on Vercel, Settings → Environment Variables, checked for Production and Preview both — then redeploy.',
    );
  }
  if (!isActivationConfigured()) {
    problems.push(
      activationSecret.length === 0
        ? 'DUKAANOS_ACTIVATION_SECRET is not set, so activation is disabled: an owner can pay but you cannot switch their plan on. Set it to start selling.'
        : 'DUKAANOS_ACTIVATION_SECRET is shorter than 32 characters, so activation is refused. Generate one with openssl rand -hex 32.',
    );
  }
  if (!supabaseConfigured) {
    problems.push(
      'Supabase is not configured, so this console is running local-first: records stay on this device only, and there is no server-side backup.',
    );
  }

  const response = NextResponse.json({
    ok: problems.length === 0,
    posture: resolvePosture(),
    vars,
    problems,
  });
  // Setup state is not a secret, but it is also not a CDN asset: never cached.
  response.headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  return response;
}

export const dynamic = 'force-dynamic';
