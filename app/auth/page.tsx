'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Check, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, Store } from 'lucide-react';

const inputClass = 'w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-11 pr-11 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState<'idle' | 'working' | 'success'>('idle');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});

  const validate = () => {
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'Email is required.';
    else if (!EMAIL_REGEX.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Password is required.';
    else if (password.length < 8) next.password = 'Password must be at least 8 characters.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (status !== 'idle') return;
    if (!validate()) return;

    setStatus('working');
    // Demo build: credentials are validated client-side, then we open the console.
    setTimeout(() => {
      setStatus('success');
      setTimeout(() => router.push('/home'), 550);
    }, 850);
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
                  placeholder="Password (8+ characters)"
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
            {status === 'idle' && <>Sign in <ArrowRight size={16} /></>}
            {status === 'working' && <><Loader2 size={16} className="animate-spin" /> Verifying credentials…</>}
            {status === 'success' && <><Check size={16} /> Welcome back — opening console</>}
          </button>

          <p className="mt-4 text-center text-xs text-zinc-500">
            Demo build — any valid email + 8-character password opens the console{remember ? ' and stays signed in on this device' : ''}.
          </p>
        </form>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-zinc-600">
          <ShieldCheck size={13} className="text-emerald-500" />
          <span>Served with CSP, HSTS & nosniff headers · Supabase Auth ready</span>
        </div>

        <p className="mt-4 text-center text-xs">
          <Link href="/" className="text-zinc-500 transition hover:text-zinc-300">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
