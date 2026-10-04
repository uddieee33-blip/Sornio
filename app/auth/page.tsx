'use client';

import Link from 'next/link';
import { Lock, Mail, Store } from 'lucide-react';

const inputClass = 'w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-11 pr-4 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';

export default function AuthPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-violet-600/15 blur-3xl" />

      <div className="animate-fade-up relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient shadow-glow">
            <Store size={26} className="text-white" />
          </div>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.25em] text-brand-300">DukaanOS</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-white">Business access</h1>
          <p className="mt-1.5 text-sm text-zinc-400">Sign in to manage your store, sales, and insights.</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-card backdrop-blur">
          <div className="space-y-4">
            <div className="relative">
              <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input type="email" placeholder="you@business.com" className={inputClass} />
            </div>
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input type="password" placeholder="Password" className={inputClass} />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 text-zinc-400">
              <input type="checkbox" defaultChecked className="h-3.5 w-3.5 rounded border-white/20 bg-white/[0.05] accent-indigo-500" />
              Keep me signed in
            </label>
            <button className="font-semibold text-brand-300 hover:underline">Forgot password?</button>
          </div>

          <Link
            href="/"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-gradient px-4 py-3 text-sm font-bold text-white shadow-glow transition hover:brightness-110"
          >
            Sign in
          </Link>

          <p className="mt-4 text-center text-xs text-zinc-500">
            Demo build — any credentials open the console.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Protected by Supabase Auth · AES-256 at rest · SOC 2 workflows
        </p>
      </div>
    </div>
  );
}
