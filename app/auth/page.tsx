'use client';

import Link from 'next/link';
import { Lock, Mail, Store } from 'lucide-react';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100';

export default function AuthPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-sidebar-gradient p-6">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-fuchsia-500/20 blur-3xl" />

      <div className="animate-fade-up relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient shadow-glow">
            <Store size={26} className="text-white" />
          </div>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.25em] text-indigo-300">DukaanOS</p>
          <h1 className="mt-2 text-2xl font-bold text-white">Business access</h1>
          <p className="mt-1.5 text-sm text-slate-400">Sign in to manage your store, sales, and insights.</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/95 p-7 shadow-2xl backdrop-blur">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
              <div className="relative">
                <Mail size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="email" className={inputClass} placeholder="owner@dukaanos.com" />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</label>
              <div className="relative">
                <Lock size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="password" className={inputClass} placeholder="••••••••" />
              </div>
            </div>
            <button className="w-full rounded-xl bg-brand-gradient px-4 py-3 text-sm font-semibold text-white shadow-glow transition hover:brightness-110">
              Sign in
            </button>
          </div>

          <div className="mt-5 flex items-center justify-between text-sm">
            <Link href="/business" className="font-semibold text-brand-600 hover:underline">Create business</Link>
            <Link href="/" className="font-semibold text-brand-600 hover:underline">View overview</Link>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-slate-400">Demo environment — authentication is illustrative.</p>
      </div>
    </div>
  );
}
