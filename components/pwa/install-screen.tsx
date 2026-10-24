'use client';

import Link from 'next/link';
import { CheckCircle2, Download, Monitor, Smartphone } from 'lucide-react';
import { BrandIcon } from '@/components/ui/BrandLogo';
import { useInstall } from './install-provider';

export function InstallScreen() {
  const { installed, canPrompt, busy, result, install } = useInstall();
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <BrandIcon size={64} className="rounded-2xl" />
      <h1 className="mt-5 font-display text-3xl font-bold text-stone-900">Install your business app</h1>
      <p className="mt-3 max-w-xl text-stone-600">Keep your billing and business records one click away on Windows or Android.</p>
      <div className="mt-6 rounded-2xl border border-stone-200 bg-panel p-5">
        {installed ? (
          <p role="status" className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 size={20} /> You are using the installed app.</p>
        ) : canPrompt ? (
          <button type="button" disabled={busy} onClick={() => void install()} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-portal-gradient px-5 py-3 font-bold text-white disabled:opacity-60"><Download size={19} /> Install app</button>
        ) : (
          <p className="font-semibold text-stone-800">Use the steps below if your browser does not show an install button.</p>
        )}
        {result === 'accepted' && !installed ? <p role="status" className="mt-3 text-sm text-stone-600">Installation requested. Finish the steps shown by your browser.</p> : null}
        {result === 'dismissed' || result === 'unavailable' ? <p role="status" className="mt-3 text-sm text-stone-600">You can keep using the website, or install later from your browser menu.</p> : null}
        <p className="mt-4 text-sm leading-relaxed text-stone-600">This installs the web app in its own window. It does not download an EXE or APK. Sign-in and cloud sync need an internet connection; a fresh offline launch shows a reconnect screen.</p>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-panel p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-stone-900"><Monitor size={21} /> Windows</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-stone-700">
            <li>Open this website in Microsoft Edge or Google Chrome.</li>
            <li>Select the install icon beside the address bar, or open the browser menu and choose Install app.</li>
            <li>Open the app from the Start menu. You can pin it to your taskbar.</li>
          </ol>
        </section>
        <section className="rounded-2xl border border-stone-200 bg-panel p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-stone-900"><Smartphone size={21} /> Android</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-stone-700">
            <li>Open this website in Google Chrome.</li>
            <li>Open the browser menu and choose Install app or Add to Home screen.</li>
            <li>Confirm installation, then open the app from your home screen.</li>
          </ol>
        </section>
      </div>
      <p className="mt-5 text-sm text-stone-600">Use the same account on each device. Cloud sync must be connected for records to follow you.</p>
      <Link href="/home" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-portal-gradient px-5 py-3 font-semibold text-white">Open my business</Link>
    </main>
  );
}
