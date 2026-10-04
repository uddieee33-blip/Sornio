'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Check, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, Store } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { LIMITS, cleanLine, isEmail, passwordStrength } from '@/lib/security/validation';
import { consume } from '@/lib/security/rate-limit';

const inputClass = 'w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-11 pr-11 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';

/**
 * Local guard against credential-stuffing from this browser.
 *
 * Honest about its scope: this protects the person at the keyboard from a
 * runaway script and gives a clear message on repeated failures. The real
 * limit lives server-side (Supabase Auth), because a client-side throttle is
 * always bypassable.
 */
const AUTH_ATTEMPT_RULE = { limit: 5, windowMs: 60_000 };

/** Real Supabase Auth when credentials exist; clearly-labelled demo mode otherwise. */
const supabaseReady = isSupabaseConfigured();

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [status, setStatus] = useState<'idle' | 'working' | 'success'>('idle');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});

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

  const openConsole = () => {
    setStatus('success');
    // New owners complete their business + bank setup; returning owners can review it.
    setTimeout(() => router.push('/onboarding'), 550);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status !== 'idle') return;
    if (!validate()) return;

    // Throttle repeated attempts from this browser before doing any work.
    const attempt = consume(`auth-ui:${email.trim().toLowerCase().slice(0, 60)}`, AUTH_ATTEMPT_RULE);
    if (!attempt.allowed) {
      setErrors({ form: `Too many attempts. Please wait ${attempt.retryAfter}s and try again.` });
      return;
    }

    setStatus('working');

    if (!supabaseReady) {
      // Local demo build: no Supabase credentials — accept any valid credentials.
      setTimeout(openConsole, 850);
      return;
    }

    try {
      const { getBrowserSupabaseClient } = await import('@/lib/supabase/client');
      const supabase = getBrowserSupabaseClient();

      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          setErrors({ form: error.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : error.message });
          setStatus('idle');
          return;
        }
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) {
          setErrors({ form: error.message });
          setStatus('idle');
          return;
        }
        // If email confirmation is required, there is no session yet — tell the owner.
        if (!data.session) {
          setErrors({ form: 'Account created. Check your inbox to confirm your email, then sign in.' });
          setStatus('idle');
          setMode('signin');
          return;
        }
      }
      openConsole();
    } catch {
      setErrors({ form: 'Could not reach the authentication service. Please try again.' });
      setStatus('idle');
    }
  };

  const fieldError = (message?: string) =>
    message ? (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-400"><AlertCircle size={12} /> {message}</p>
    ) : null;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />

      <div className="animate-fade-up relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient shadow-glow">
            <Store size={26} className="text-white" />
          </div>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.25em] text-brand-300">DukaanOS</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-white">Business access</h1>
          <p className="mt-1.5 text-sm text-zinc-400">Sign in to manage your store, sales, and insights.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-card backdrop-blur">
          {errors.form ? (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-400 ring-1 ring-inset ring-red-500/20 animate-fade-in">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> {errors.form}
            </div>
          ) : null}

          {supabaseReady ? (
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/[0.06]">
              {(['signin', 'signup'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => { setMode(option); setErrors((current) => ({ ...current, form: undefined })); }}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition ${mode === option ? 'bg-brand-500/20 text-brand-200' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  {option === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-4 rounded-xl bg-amber-500/[0.08] px-3.5 py-2.5 text-xs font-semibold text-amber-400/90 ring-1 ring-inset ring-amber-500/20">
              Demo mode — Supabase credentials are not set, so sign-in is simulated on this device.
            </div>
          )}

          <div className="space-y-4">
            <div>
              <div className="relative">
                <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="you@business.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((current) => ({ ...current, email: undefined })); }}
                  className={`${inputClass} ${errors.email ? 'border-red-500/50' : ''}`}
                />
              </div>
              {fieldError(errors.email)}
            </div>

            <div>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={`Password (${LIMITS.minPassword}+ characters)`}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors((current) => ({ ...current, password: undefined })); }}
                  className={`${inputClass} ${errors.password ? 'border-red-500/50' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-300"
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
                            : 'bg-white/[0.08]'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-zinc-500">
                    {strength.score >= 3 ? 'Strong password.' : strength.advice}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs">
            <label className="flex cursor-pointer items-center gap-2 text-zinc-400">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-3.5 w-3.5 rounded accent-indigo-500" />
              Keep me signed in
            </label>
            <button type="button" className="font-semibold text-brand-300 hover:underline">Forgot password?</button>
          </div>

          <button
            type="submit"
            disabled={status !== 'idle'}
            className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-glow transition ${status === 'success' ? 'bg-emerald-500' : 'bg-brand-gradient hover:brightness-110'} ${status !== 'idle' ? 'cursor-wait' : ''}`}
          >
            {status === 'idle' && <>{mode === 'signup' ? 'Create account' : 'Sign in'} <ArrowRight size={16} /></>}
            {status === 'working' && <><Loader2 size={16} className="animate-spin" /> Verifying credentials…</>}
            {status === 'success' && <><Check size={16} /> Welcome — setting up your business</>}
          </button>

          <p className="mt-4 text-center text-xs text-zinc-500">
            {supabaseReady
              ? 'Secured by Supabase Auth — passwords are never stored by the app.'
              : `Demo build — any valid email + a ${LIMITS.minPassword}-character password opens the console${remember ? ' and stays signed in on this device' : ''}.`}
          </p>
        </form>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-zinc-600">
          <ShieldCheck size={13} className="text-emerald-500" />
          <span>Locked-down CSP, nosniff &amp; strict referrer policy · records encrypted on your device</span>
        </div>

        <p className="mt-4 text-center text-xs">
          <Link href="/" className="text-zinc-500 transition hover:text-zinc-300">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
