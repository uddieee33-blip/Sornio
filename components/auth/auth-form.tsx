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
 *
 * **The door is not a formality.** When this device is already signed in the
 * screen shows "Welcome back" and a name — and a session cookie proves the
 * *browser* was authenticated, not that the owner is the one now tapping
 * Continue. Behind that door are the day's takings, the customer list and the
 * khata, on a tablet that lives on a counter. So a door into the console asks for
 * the account password (hosted) or this device's own owner password (local-first)
 * before it opens, and only a door into *setup* — an owner who has not finished —
 * opens on a tap, because there is nothing behind it yet to guard. It is the same
 * distinction the counter lock and the owner-password gate in Settings are built
 * on, applied at the moment it matters most.
 *
 * **Where the door goes is not this screen's guess.** `welcomeDestination` folds
 * together the destination the caller asked for, the account's answer, and this
 * device's own vault, so an owner who has already filled in the three steps —
 * bank details and collection QR included — lands in the console instead of being
 * handed their own phone number to type again.
 */

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Check, Clock, Eye, EyeOff, KeyRound, Loader2, Lock, LogOut, Mail } from 'lucide-react';
import { LIMITS, cleanLine, isEmail, passwordStrength } from '@/lib/security/validation';
import { sessionSecretConfigError } from '@/lib/security/session';
import { consume } from '@/lib/security/rate-limit';
import { doorNeedsConfirmation, signInNextParam, welcomeDestination } from '@/lib/auth/routes';
import { confirmConsoleAccess, requestPasswordReset, signOutAndLeave, submitCredentials, type RenderedIdentity } from '@/lib/auth/client';
import { PIN_LENGTH, markUnlocked, readLockRecord, verifyPin, writeLockRecord, type LockRecord } from '@/lib/security/lock';
import { snapshotFromProfile } from '@/lib/sync/profile';
import { useDukaanStore } from '@/lib/store';
import type { AuthFailureNotice } from '@/lib/auth/types';

const inputClass =
  'w-full rounded-xl border border-stone-200 bg-stone-50 py-3 pl-11 pr-11 text-sm text-stone-900 placeholder-stone-500 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus';

/** Client-side guard against a runaway script hammering this browser. */
const AUTH_ATTEMPT_RULE = { limit: 5, windowMs: 60_000 };

/** Phrases the server's fixed failure codes map onto. */
const NOTICES: Record<AuthFailureNotice, string> = {
  link: 'That link has already been used or has expired. Sign in below, then request a new one.',
  local: 'This build has no account to confirm, so there is nothing to open here. Sign in below.',
  unavailable: 'Could not reach the authentication service. Please try again.',
  config: sessionSecretConfigError(),
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
  /**
   * The destination the *caller* asked for — a bookmarked `?next=`, a price they
   * clicked — already through `safeNext` on the server, or `null` when nobody
   * asked. `null` is the useful answer: it leaves the decision to what the
   * account knows, and then to the endpoint after it has verified credentials.
   */
  requested: string | null;
  /** The account's stored profile says setup is finished. The server's answer. */
  accountSetupComplete: boolean;
  notice: AuthFailureNotice | null;
  identity: RenderedIdentity | null;
};

/** What the "Welcome back" door is waiting for before it opens. */
type Gate = 'closed' | 'password' | 'passcode';

export default function AuthForm({ supabaseReady, requested, accountSetupComplete, notice, identity }: AuthFormProps) {
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

  /* ---- the door, and what it asks for ---------------------------------- */
  const [gate, setGate] = useState<Gate>('closed');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [gateStatus, setGateStatus] = useState<'idle' | 'working' | 'success'>('idle');
  const [gateError, setGateError] = useState<string | null>(null);
  /**
   * The door has been left for the full sign-in form: either the account session
   * behind it has ended, so there is nothing to confirm against, or the owner
   * needs the recovery panel — which needs an address the door never held. Both
   * routes ask for strictly more than the gate did, so neither is a bypass.
   */
  const [fullForm, setFullForm] = useState(false);
  /**
   * The lock record is read at click time into a ref rather than into state: the
   * decision has to be made from what is in storage *now*, and a value that only
   * arrives with an effect is one a fast tap can beat.
   */
  const lockRecord = useRef<LockRecord | null>(null);

  const { state, hydrated } = useDukaanStore();

  /*
   * This device's own answer to "has this owner finished setup?".
   *
   * The account's answer cannot exist on a local-first build — there is no row —
   * and it does not arrive on a hosted one until the vault has hydrated and, if
   * this device had forgotten the profile, until the account replies. The same
   * `snapshotFromProfile` the server runs derives it from the stored fields, so
   * the two answers cannot mean different things.
   */
  const deviceSetupComplete = useMemo(
    () => !supabaseReady && hydrated && snapshotFromProfile(state.profile).setupComplete,
    [supabaseReady, hydrated, state.profile],
  );

  const doors = { requested, accountSetupComplete, deviceSetupComplete };
  const destination = welcomeDestination(doors);
  /** `undefined` means "you decide" — the endpoint knows the account, this browser only knows the device. */
  const nextParam = signInNextParam(doors);
  const needsConfirmation = doorNeedsConfirmation(destination);

  /*
   * A local-first door with no owner password to ask for is a door that just
   * opens, and it has to say so rather than look like the gate silently failed.
   *
   * Read during render, but only once the store has hydrated: `localStorage`
   * exists in exactly one of the two renders that have to agree, so the first
   * client paint matches the server's HTML and the note arrives on the second —
   * the same trick the setup screen uses for the profile. This is the cosmetic
   * half; `openDoor` reads the record again at click time, which is the half
   * that decides anything.
   */
  const passcodeMissing =
    needsConfirmation && identity?.provider === 'local' && hydrated && !readLockRecord()?.enabled;

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

  /** The door's own exit: a full load, for the same reason the form's is. */
  const walkIn = (target: string) => {
    setGateStatus('success');
    setTimeout(() => {
      window.location.assign(target);
    }, 450);
  };

  /**
   * What "Continue" means on a device that is already signed in.
   *
   * Three answers, and which one applies is decided *here*, at click time:
   *
   *   • a door into setup opens — nothing behind it but a form not yet filled in;
   *   • a hosted door into the console asks for the account password, checked by
   *     the provider against the session this request arrived with;
   *   • a local-first door asks for this device's own owner password, the same
   *     6-digit PIN the counter lock uses, because on a build with no provider
   *     that is the only secret that exists here.
   *
   * The lock record is read inside the handler rather than in an effect: a value
   * that arrives after mount is one a fast tap can beat, and a gate that can be
   * beaten is worse than no gate, because it is a gate somebody trusted.
   */
  const openDoor = () => {
    if (!identity || gateStatus !== 'idle') return;
    if (!needsConfirmation) {
      window.location.assign(destination);
      return;
    }
    setGateError(null);
    if (identity.provider === 'supabase') {
      setGate('password');
      return;
    }
    const record = readLockRecord();
    if (!record?.enabled) {
      // No secret on this device to check against. Opening is the honest thing —
      // pretending to verify something that does not exist is not — and the card
      // has already said so, with the door to fix it.
      window.location.assign(destination);
      return;
    }
    lockRecord.current = record;
    setPasscode('');
    setGate('passcode');
  };

  /** The hosted gate: one password, no email, checked by the provider. */
  const submitConfirmation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (gateStatus !== 'idle') return;
    if (confirmPassword.length < LIMITS.minPassword) {
      setGateError(`Password must be at least ${LIMITS.minPassword} characters.`);
      return;
    }

    const attempt = consume(`auth-door:${identity?.userId ?? 'welcome'}`, AUTH_ATTEMPT_RULE);
    if (!attempt.allowed) {
      setGateError(`Too many attempts. Please wait ${attempt.retryAfter}s and try again.`);
      return;
    }

    setGateStatus('working');
    const result = await confirmConsoleAccess(confirmPassword, nextParam);
    if (!result.ok) {
      // Cleared on every failure: a field left holding a wrong password is one
      // autofill will happily resubmit, five times, into the lockout.
      setConfirmPassword('');
      setGateStatus('idle');
      if (result.code === 'confirm-session-ended' || result.code === 'confirm-unavailable') {
        setGate('closed');
        setFullForm(true);
        setErrors({ form: result.error });
        return;
      }
      setGateError(result.error ?? NOTICES.unavailable);
      return;
    }
    // The server's answer wins: it was decided after the password was verified,
    // from the account row, so it knows whether setup is finished even on a
    // device whose vault is empty.
    walkIn(result.next ?? destination);
  };

  /** The local-first gate: this device's owner password, checked on the device. */
  const submitPasscode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (gateStatus !== 'idle') return;

    const record = lockRecord.current ?? readLockRecord();
    if (!record?.enabled) {
      // Turned off (or never set) while this panel was open. Nothing left to
      // check, so the door opens rather than spinning on a secret that has gone.
      setGate('closed');
      window.location.assign(destination);
      return;
    }
    if (passcode.length !== PIN_LENGTH) {
      setGateError(`The owner password is ${PIN_LENGTH} digits.`);
      return;
    }

    setGateStatus('working');
    const verdict = await verifyPin(passcode, record);
    if (verdict.record) {
      // The failure count and the lockout window are part of the record; dropping
      // the write would give every visitor a fresh five attempts forever.
      writeLockRecord(verdict.record);
      lockRecord.current = verdict.record;
    }
    if (!verdict.ok) {
      setPasscode('');
      setGateStatus('idle');
      setGateError(verdict.error);
      return;
    }

    /*
     * Asked once. This is the same per-tab flag the console's own lock reads, so
     * the owner is not greeted by a second keypad two seconds after this one —
     * one password, one door, and the console opens behind it.
     */
    markUnlocked();
    setGateError(null);
    walkIn(destination);
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
      // Omitted unless this browser actually knows something: the endpoint
      // re-answers the question from the account row it can read *after* the
      // credentials are verified, and a guess made before anybody was
      // authenticated would overwrite that answer with the stale one.
      next: nextParam,
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

  /*
   * Already signed in on this device: the useful screen is the door, not the form.
   *
   * A door, not an open doorway. `fullForm` is the one way past it — an owner the
   * account session has stranded, or one who needs the recovery panel — and both
   * routes land on a screen that asks for strictly more than the gate did.
   */
  if (identity && !fullForm) {
    // Booleans, computed here rather than compared in the markup: the copy
    // extractor reads a string literal in a JSX expression as product prose, and
    // a state value is not a sentence anybody should be asked to translate.
    const doorClosed = gate === 'closed';
    const passwordGate = gate === 'password';
    const passcodeGate = gate === 'passcode';
    const gateOpen = !doorClosed;
    return (
      <div className="rounded-3xl border border-stone-200 bg-stone-50 p-7 text-center shadow-card">
        <span
          className={`mx-auto flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ring-inset ${
            gateOpen ? 'bg-amber-500/15 text-amber-700 ring-amber-500/25' : 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/25'
          }`}
        >
          {gateOpen ? <Lock size={20} /> : <Check size={20} />}
        </span>
        <h2 className="mt-3 font-display text-lg font-bold text-stone-900">
          {passwordGate ? 'Confirm it’s you' : passcodeGate ? 'Owner password needed' : 'Welcome back'}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
          {identity.displayName}
          {identity.expiresAt ? ` · ${`Session ends ${endsAt(identity.expiresAt)}`}` : ''}
        </p>

        {doorClosed ? (
          <>
            {needsConfirmation ? (
              /* Why a tap is not enough, said before the tap rather than after
                 the field appears: a gate nobody saw coming reads as a bug. */
              <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed text-stone-600">
                Continue asks for your password before the console opens — a signed-in device is not the same as the
                right person at the counter.
              </p>
            ) : null}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={openDoor}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-gradient px-5 py-2.5 text-sm font-bold text-white shadow-glow-sm transition hover:brightness-110"
              >
                {needsConfirmation ? <KeyRound size={15} /> : null}
                Continue
                {needsConfirmation ? null : <ArrowRight size={15} />}
              </button>
              <Link
                href="/settings"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
              >
                Who is using this app?
              </Link>
            </div>
            {passcodeMissing ? (
              /*
               * Not a warning that can be acted on silently. On a build with no
               * provider there is no account password, and a device with no owner
               * password either has nothing to check — so the door says that out
               * loud and points at the one page that changes it.
               */
              <p className="mt-4 text-xs leading-relaxed text-amber-700/90">
                No owner password is set on this device — Continue opens the console as it is.{' '}
                <Link href="/security" className="font-semibold text-stone-700 underline underline-offset-4">
                  Set it on the Security page
                </Link>
                .
              </p>
            ) : null}
          </>
        ) : null}

        {passwordGate ? (
          <form onSubmit={submitConfirmation} noValidate className="mt-5 space-y-3 text-left">
            <p className="text-center text-xs leading-relaxed text-stone-600">
              Your session is open on this device. Enter your account password to walk into the console.
            </p>
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-600" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="current-password"
                suppressHydrationWarning
                autoFocus
                placeholder={`Password (${LIMITS.minPassword}+ characters)`}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (gateError) setGateError(null);
                }}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-stone-600 transition hover:bg-stone-100 hover:text-stone-700"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {gateError ? (
              <p className="flex items-start gap-1.5 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-500/20 animate-fade-in">
                <AlertCircle size={13} className="mt-0.5 shrink-0" /> {gateError}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={gateStatus !== 'idle'}
              className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-glow transition ${
                gateStatus === 'success' ? 'bg-emerald-500' : 'bg-brand-gradient hover:brightness-110'
              } ${gateStatus !== 'idle' ? 'cursor-wait' : ''}`}
            >
              {gateStatus === 'working' ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Checking…
                </>
              ) : (
                <>
                  {gateStatus === 'success' ? <Check size={16} /> : <Lock size={15} />} Open console
                </>
              )}
            </button>
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  // Recovery needs the address, and the address lives on the full
                  // form: the door deliberately never had one to offer.
                  setGate('closed');
                  setGateError(null);
                  setFullForm(true);
                  setForgotOpen(true);
                  setErrors({});
                }}
                className="font-semibold text-brand-600 hover:underline"
              >
                Forgot password?
              </button>
              <button
                type="button"
                onClick={() => void signOutAndLeave()}
                className="inline-flex items-center gap-1.5 font-semibold text-stone-600 transition hover:text-stone-900"
              >
                <LogOut size={12} /> Sign out
              </button>
            </div>
          </form>
        ) : null}

        {passcodeGate ? (
          <form onSubmit={submitPasscode} noValidate className="mt-5 space-y-3 text-left">
            <p className="text-center text-xs leading-relaxed text-stone-600">
              This device is signed in. Enter the owner password you set on the Security page to open the
              console.
            </p>
            <label
              htmlFor="door-passcode"
              className="block text-center text-[11px] font-bold tracking-[0.16em] text-stone-600 uppercase"
            >
              {PIN_LENGTH}-digit owner password
            </label>
            <input
              id="door-passcode"
              value={passcode}
              onChange={(e) => {
                setPasscode(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH));
                if (gateError) setGateError(null);
              }}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="••••••"
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-center font-mono text-lg tracking-[0.4em] text-stone-900 placeholder-stone-400 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus"
            />
            {gateError ? (
              <p className="flex items-start gap-1.5 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-500/20 animate-fade-in">
                <AlertCircle size={13} className="mt-0.5 shrink-0" /> {gateError}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={gateStatus !== 'idle' || passcode.length !== PIN_LENGTH}
              className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-glow transition disabled:opacity-60 ${
                gateStatus === 'success' ? 'bg-emerald-500' : 'bg-brand-gradient hover:brightness-110'
              } ${gateStatus !== 'idle' ? 'cursor-wait' : ''}`}
            >
              {gateStatus === 'working' ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Checking…
                </>
              ) : (
                <>
                  {gateStatus === 'success' ? <Check size={16} /> : <Lock size={15} />} Open console
                </>
              )}
            </button>
            <div className="flex items-center justify-between text-xs">
              {/* Pointed at the console, not at the Security page: a forgotten
                  owner password is cleared from the lock screen, which is the one
                  screen that says what clearing it costs. A link to `/security`
                  here would promise a page the locked console never renders. */}
              <span className="text-stone-600">
                Forgot it?{' '}
                <Link href="/home" className="font-semibold text-stone-700 underline underline-offset-4">
                  The lock screen shows how to clear it
                </Link>
                .
              </span>
              <button
                type="button"
                onClick={() => void signOutAndLeave()}
                className="inline-flex items-center gap-1.5 font-semibold text-stone-600 transition hover:text-stone-900"
              >
                <LogOut size={12} /> Sign out
              </button>
            </div>
          </form>
        ) : null}
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
      className="rounded-3xl border border-stone-200 bg-stone-50 p-7 shadow-card"
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
              className={`rounded-lg px-3 py-2 text-xs font-bold transition ${mode === option ? 'bg-brand-500/15 text-brand-700 shadow-card ring-1 ring-inset ring-brand-500/25' : 'text-stone-600 hover:text-stone-900'}`}
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

