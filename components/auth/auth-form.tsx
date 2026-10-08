'use client';

/**
 * The sign-in screen.
 *
 * One form, two modes, and one rule that outranks both: **the password is sent to
 * this origin and nowhere else in the app.** `POST /api/auth/session` performs the
 * exchange with a server-bound Supabase client, so the auth cookie is set by the
 * server with the server's attributes, the DukaanOS session is minted beside it,
 * and no token ever lands in a place page script can reach. The version of this
 * screen that called the browser Supabase client directly looked identical and was
 * not: the session lived in `localStorage`, the edge could not see it, and a reload
 * forgot who was at the counter.
 *
 * Demo mode is not hidden and not apologised for. With placeholder credentials
 * there is no provider to ask, so any well-formed email and a strong-enough
 * password open the console **on this device** — and the label above the form says
 * exactly that, in the same words the README uses. What demo mode still does
 * properly is the part that used to be decorative: it mints a real signed session,
 * so "Keep me signed in" means the cookie survives a reload, and unchecking it
 * means the browser closing ends the access.
 *
 * The local attempt throttle below is a courtesy to the person at the keyboard, and
 * it is honest about being bypassable. The limit that counts is server-side: the
 * `auth` bucket in `lib/security/policy.json` (12 a minute per client) and the
 * abuse penalty behind it.
 */

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Check, Clock, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { LIMITS, cleanLine, isEmail, passwordStrength } from '@/lib/security/validation';
import { consume } from '@/lib/security/rate-limit';
import { requestPasswordReset, submitCredentials, type RenderedIdentity } from '@/lib/auth/client';
import type { AuthFailureNotice } from '@/lib/auth/types';

const inputClass =
  'w-full rounded-xl border border-stone-200 bg-stone-50 py-3 pl-11 pr-11 text-sm text-stone-900 placeholder-stone-500 outline-none transition focus:border-portal/50 focus:ring-2 focus:ring-focus';

/** Client-side guard against a runaway script hammering this browser. */
const AUTH_ATTEMPT_RULE = { limit: 5, windowMs: 60_000 };

/** Phrases the server's fixed failure codes map onto. */
const NOTICES: Record<AuthFailureNotice, string> = {
  link: 'That link has already been used or has expired. Sign in below, then request a new one.',
  local: 'This build has no account to confirm, so there is nothing to open here. Sign in below.',
  unavailable: 'Could not reach the authentication service. Please try again.',
};

/** `12 Mar, 09:40` — the same format the top bar uses for a session expiry. */
function endsAt(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1000);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export type AuthFormProps = {
  /** True when real Supabase credentials exist for this deployment. */
  supabaseReady: boolean;
  /** Where a successful sign-in goes, already validated on the server. */
  destination: string;
  notice: AuthFailureNotice | null;
  identity: RenderedIdentity | null;
};

export default function AuthForm({ supabaseReady, destination, notice, identity }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  // A boolean rather than a named panel: 'form' / 'forgot' as string states are
  // values, and a value extractor cannot tell them apart from a label.
  const [forgotOpen, setForgotOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'working' | 'success'>('idle');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string; note?: string }>(
    notice ? { form: NOTICES[notice] } : {},
  );

  const strength = passwordStrength(password);

  const validate = () => {
    const next: typeof errors = {};
    const candidate = cleanLine(email, 254);
    if (!candidate) next.email = 'Email is required.';
    else if (!isEmail(candidate)) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Password is required.';
    else if (password.length < LIMITS.minPassword) next.password = `Password must be at least ${LIMITS.minPassword} characters.`;
    else if (mode === 'signup' && strength.score < 2) next.password = `Choose something stronger. ${strength.advice}`;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /**
   * Sign-in ends in a full load of the destination, not a router push.
   *
   * The console layout decides what to render from the session cookie, and that
   * decision was already made for this document — as "not signed in". A soft
   * transition would spend the first frames on a shell that then has to correct
   * itself, which is the flicker this app refuses everywhere else.
   */
  const openConsole = (target: string) => {
    setStatus('success');
    setTimeout(() => {
      // The destination came from the server, through `safeNext`. It is still a
      // same-origin path at this point, so `assign` cannot be aimed at anybody
      // else's host — the one thing a post-login redirect has to be certain of.
      window.location.assign(target);
    }, 550);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status !== 'idle') return;
    if (!validate()) return;

    const attempt = consume(`auth-ui:${email.trim().toLowerCase().slice(0, 60)}`, AUTH_ATTEMPT_RULE);
    if (!attempt.allowed) {
      setErrors({ form: `Too many attempts. Please wait ${attempt.retryAfter}s and try again.` });
      return;
    }

    setStatus('working');
    const result = await submitCredentials({
      action: mode === 'signup' ? 'sign-up' : 'sign-in',
      email: email.trim(),
      password,
      remember,
      next: destination,
    });

    if (!result.ok) {
      setErrors({ form: result.error });
      setStatus('idle');
      return;
    }

    // Account created, confirmation required: there is no session to open a
    // console with, and the honest thing is to say so and hand the owner back to
    // the sign-in tab they will come back to in a minute.
    if (result.pending === 'email-confirmation') {
      setErrors({ note: 'Account created. Check your inbox to confirm your email, then sign in.' });
      setStatus('idle');
      setMode('signin');
      return;
    }

    // The server's `next` wins over what the page asked for: it is the same value
    // run through `safeNext`, and the copy that chose the default (a new owner
    // goes to setup, a returning one goes where they were headed) stays in one file.
    openConsole(result.next ?? destination);
  };

  const submitReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status !== 'idle') return;
    const candidate = cleanLine(email, 254);
    if (!isEmail(candidate)) {
      setErrors({ email: 'Enter a valid email address.' });
      return;
    }
    setStatus('working');
    const result = await requestPasswordReset(candidate);
    setStatus('idle');
    if (!result.ok) {
      setErrors({ form: result.error });
      return;
    }
    /*
     * Hosted: one flat confirmation for every outcome, because the server made
     * sure the answer cannot reveal whether an account exists. Local: the same
     * field carries the refusal, and it goes in the error box — a green tick
     * next to "no mail was sent" is the kind of UI that teaches people to
     * distrust green ticks.
     */
    const text = result.message ?? '';
    if (result.delivered) {
      setErrors({ note: text, form: undefined });
      setForgotOpen(false);
    } else {
      setErrors({ note: undefined, form: text });
    }
  };

  const fieldError = (message?: string) =>
    message ? (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-700">
        <AlertCircle size={12} /> {message}
      </p>
    ) : null;

  // Already signed in on this device: the useful screen is the door, not the form.
  if (identity) {
    return (
      <div className="rounded-3xl border border-stone-200 bg-stone-50 p-7 text-center shadow-card backdrop-blur">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/25">
          <Check size={20} />
        </span>
        <h2 className="mt-3 font-display text-lg font-bold text-stone-900">Welcome back</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
          {identity.displayName}
          {identity.expiresAt ? ` · ${`Session ends ${endsAt(identity.expiresAt)}`}` : ''}
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => window.location.assign(destination)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-gradient px-5 py-2.5 text-sm font-bold text-white shadow-glow-sm transition hover:brightness-110"
          >
            Continue <ArrowRight size={15} />
          </button>
          <Link
            href="/settings"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
          >
            Who is using this app?
          </Link>
        </div>
      </div>
    );
  }

  return (
    /*
     * `suppressHydrationWarning` here is not a shrug: Chrome's autofill paints
     * a `__gcruniqueid` attribute onto a form and the credential fields it can
     * fill *before* React hydrates, and React's development build then reports
     * `- __gcruniqueid="1"` as a hydration mismatch on a page that is perfectly
     * correct. The attribute belongs to the browser, not to this app — it never
     * appears in the HTML the server sends — and every attribute these elements
     * do render is static at first render, so tolerating it cannot hide a
     * mistake of ours. Scoped to the credential surface on purpose: this is the
     * app's only <form>, the console's search boxes are single unlabelled
     * fields that autofill leaves alone, and silencing the check everywhere
     * would blind it to real mismatches.
     */
    <form
      onSubmit={handleSubmit}
      noValidate
      suppressHydrationWarning
      className="rounded-3xl border border-stone-200 bg-stone-50 p-7 shadow-card backdrop-blur"
    >
      {errors.form ? (
        <div className="animate-fade-in mb-4 flex items-start gap-2 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-500/20">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {errors.form}
        </div>
      ) : null}

      {errors.note ? (
        <div className="animate-fade-in mb-4 flex items-start gap-2 rounded-xl bg-emerald-500/10 px-3.5 py-2.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-500/20">
          <Check size={14} className="mt-0.5 shrink-0" /> {errors.note}
        </div>
      ) : null}

      {supabaseReady ? (
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-stone-50 p-1 ring-1 ring-inset ring-stone-200">
          {(['signin', 'signup'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setMode(option);
                setForgotOpen(false);
                setErrors((current) => ({ ...current, form: undefined, note: undefined }));
              }}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition ${mode === option ? 'bg-brand-500/20 text-brand-200' : 'text-stone-600 hover:text-stone-700'}`}
            >
              {option === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-4 rounded-xl bg-amber-500/[0.08] px-3.5 py-2.5 text-xs font-semibold text-amber-700/90 ring-1 ring-inset ring-amber-500/20">
          Demo mode — Supabase credentials are not set, so sign-in is simulated on this device.
        </div>
      )}

      {forgotOpen ? (
        /* Recovery is a panel of this form rather than a route: the address is
           already typed, and a page change would throw it away. */
        <div className="space-y-4">
          <div>
            <div className="relative">
              <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-600" />
              <input
                type="email"
                autoComplete="email"
                suppressHydrationWarning
                placeholder="you@business.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((current) => ({ ...current, email: undefined }));
                }}
                className={`${inputClass} ${errors.email ? 'border-red-500/50' : ''}`}
              />
            </div>
            {fieldError(errors.email)}
          </div>
          <p className="text-xs leading-relaxed text-stone-600">
            We send a link to that address if an account uses it. It opens the console once and lets you set a new
            password — the old one stops working at that moment, not before.
          </p>
          <button
            type="submit"
            onClick={submitReset}
            disabled={status !== 'idle'}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-gradient px-4 py-3 text-sm font-bold text-white shadow-glow transition hover:brightness-110 disabled:cursor-wait"
          >
            {status === 'working' ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Checking…
              </>
            ) : (
              <>
                Send reset link <ArrowRight size={16} />
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setForgotOpen(false);
              setErrors({});
            }}
            className="w-full text-center text-xs font-semibold text-stone-600 transition hover:text-stone-900"
          >
            Back to sign in
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            <div>
              <div className="relative">
                <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-600" />
                <input
                  type="email"
                  autoComplete="email"
                  suppressHydrationWarning
                  placeholder="you@business.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((current) => ({ ...current, email: undefined }));
                  }}
                  className={`${inputClass} ${errors.email ? 'border-red-500/50' : ''}`}
                />
              </div>
              {fieldError(errors.email)}
            </div>

            <div>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-600" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  suppressHydrationWarning
                  placeholder={`Password (${LIMITS.minPassword}+ characters)`}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
                  }}
                  className={`${inputClass} ${errors.password ? 'border-red-500/50' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-stone-600 transition hover:bg-stone-100 hover:text-stone-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldError(errors.password)}

              {mode === 'signup' && password ? (
                <div className="mt-2.5" aria-live="polite">
                  <div className="flex gap-1.5" aria-hidden>
                    {[0, 1, 2, 3].map((step) => (
                      <span
                        key={step}
                        className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                          strength.score > step
                            ? strength.score >= 3
                              ? 'bg-emerald-400'
                              : strength.score === 2
                                ? 'bg-amber-400'
                                : 'bg-red-400'
                            : 'bg-stone-100'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-stone-600">
                    {strength.score >= 3 ? 'Strong password.' : strength.advice}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs">
            <label className="flex cursor-pointer items-center gap-2 text-stone-600">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-indigo-500"
              />
              Keep me signed in
            </label>
            {supabaseReady ? (
              <button
                type="button"
                onClick={() => {
                  setForgotOpen(true);
                  setErrors({});
                }}
                className="font-semibold text-brand-600 hover:underline"
              >
                Forgot password?
              </button>
            ) : (
              <span className="flex items-center gap-1 text-stone-500">
                <Clock size={11} /> 12 hours idle
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={status !== 'idle'}
            className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-glow transition ${status === 'success' ? 'bg-emerald-500' : 'bg-brand-gradient hover:brightness-110'} ${status !== 'idle' ? 'cursor-wait' : ''}`}
          >
            {status === 'idle' && (
              <>
                {mode === 'signup' ? 'Create account' : 'Sign in'} <ArrowRight size={16} />
              </>
            )}
            {status === 'working' && (
              <>
                <Loader2 size={16} className="animate-spin" /> Verifying credentials…
              </>
            )}
            {status === 'success' && (
              <>
                <Check size={16} /> Welcome — setting up your business
              </>
            )}
          </button>

          <p className="mt-4 text-center text-xs text-stone-600">
            {supabaseReady
              ? 'Secured by Supabase Auth — passwords are never stored by the app.'
              : `Demo build — any valid email + a ${LIMITS.minPassword}-character password opens the console${remember ? ' and stays signed in on this device' : ''}.`}
          </p>
        </>
      )}
    </form>
  );
}
