'use client';

/**
 * Environment setup — the section that says what to put where.
 *
 * Sornio has a handful of settings that are deliberately **not** editable in
 * the console: the platform's UPI id, the secrets that sign sessions and
 * activation codes, the Supabase keys. They live in the deployment's environment
 * because they are the platform's own money and cryptography, and a value a
 * browser can rewrite is a value anybody can rewrite.
 *
 * That decision is worthless if the owner cannot then *find* them. So this
 * section does the three things that make a server-side setting usable by a
 * human:
 *
 *   1. **Shows the real state.** `GET /api/health` reports, per variable,
 *      whether it is set, whether it is strong, and whether anything is wrong
 *      with it — for this deployment, right now. No "please contact support".
 *   2. **Shows the exact file and line.** Copy-pasteable, with no key values
 *      involved: placeholders and formats only.
 *   3. **Never echoes a secret.** Values are never returned by the API and never
 *      rendered; a set variable is described by its length, not its contents.
 *
 * The variable names are ours, not the browser's: nothing here can set a
 * variable, only report one and tell the owner how to.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CheckCircle2, ClipboardCopy, Copy, FileCode2, RefreshCw, ServerCog, ShieldAlert, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardTitle } from '@/components/ui/Card';
import { useToast } from '@/lib/ui/toast';

export type EnvStatus = {
  key: string;
  label: string;
  scope: 'public' | 'server';
  /** Nothing works without it. */
  required: boolean;
  configured: boolean;
  /** Length for server secrets, the value itself for public settings. */
  detail: string | null;
  /** Where the owner is warned when the variable is absent or malformed. */
  surface: string;
  hint: string;
  format: string;
};

export type EnvReport = {
  ok: boolean;
  posture: string;
  vars: EnvStatus[];
  /** One sentence per real problem, in the order they matter. */
  problems: string[];
};

const SCOPE_TONE = { public: 'sky', server: 'violet' } as const;

function StatusDot({ status }: { status: EnvStatus }) {
  if (!status.required && !status.configured) return <Badge tone="slate">Optional — off</Badge>;
  if (status.configured) return <Badge tone="emerald" dot>Set</Badge>;
  return status.required ? <Badge tone="amber" dot>Missing</Badge> : <Badge tone="amber">Not set</Badge>;
}

export function EnvSetup({ children }: { children?: ReactNode }) {
  const toast = useToast();
  const [report, setReport] = useState<EnvReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  /** Bumped to ask for a fresh read; the effect below owns the fetching. */
  const [attempt, setAttempt] = useState(0);

  /**
   * Read the deployment's own state, once per attempt.
   *
   * State is only written from the promise callbacks (never synchronously in the
   * effect body), which is the difference between one render and a cascade.
   */
  useEffect(() => {
    let cancelled = false;
    fetch('/api/health', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`The server answered ${response.status}.`);
        return (await response.json()) as EnvReport;
      })
      .then((next) => {
        if (cancelled) return;
        setReport(next);
        setFailed(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setReport(null);
        setFailed(error instanceof Error ? error.message : 'Could not read the setup state.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  /** The Re-check button: show the spinner, then ask the effect to run again. */
  const reload = useCallback(() => {
    setLoading(true);
    setAttempt((value) => value + 1);
  }, []);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
      toast.success('Copied', 'Paste it into .env.local on the server, then restart the app.');
    } catch {
      toast.error('Could not copy', 'Select the text and copy it manually.');
    }
  };

  return (
    <div className="space-y-5">
      <Card className="animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle icon={<ServerCog size={16} />}>How this deployment is configured</CardTitle>
          <div className="flex items-center gap-2">
            {report ? <Badge tone={report.posture === 'strict' ? 'emerald' : 'amber'} dot>{report.posture === 'strict' ? 'Production posture' : 'Preview posture'}</Badge> : null}
            <button
              type="button"
              onClick={reload}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 transition hover:border-brand-400/40 hover:text-brand-600"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Re-check
            </button>
          </div>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          These settings are read on the <strong>server</strong>, never in the browser — which is why they are not typed
          into this console. A value a browser can change is a value anybody can change, and two of these sign your
          sessions and your activation codes. What this card does is show you the real state and tell you exactly where
          each one goes.
        </p>

        {failed ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/[0.08] p-3 text-xs text-amber-900 ring-1 ring-inset ring-amber-500/25">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            Could not read the configuration state ({failed}). The values below are still the ones that matter; the
            console keeps working either way.
          </p>
        ) : null}

        {report && report.problems.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {report.problems.map((problem) => (
              <li key={problem} className="flex items-start gap-2 rounded-xl bg-amber-500/[0.08] p-3 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-500/25">
                <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                {problem}
              </li>
            ))}
          </ul>
        ) : report ? (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-500/[0.07] p-3 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-500/20">
            <CheckCircle2 size={14} /> Everything this deployment needs is set, and each value passes its format check.
          </p>
        ) : null}
      </Card>

      {report ? (
        <div className="space-y-3">
          {report.vars.map((status) => (
            <Card key={status.key} className="animate-fade-up">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold text-stone-900">{status.key}</p>
                  <p className="mt-0.5 text-xs text-stone-600">{status.label}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge tone={SCOPE_TONE[status.scope]}>{status.scope === 'server' ? 'Server only' : 'Public'}</Badge>
                  <StatusDot status={status} />
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Format</p>
                  <p className="mt-1 break-all font-mono text-xs text-stone-700">{status.format}</p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">
                    {status.configured ? 'Current value' : 'What happens without it'}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-700">{status.detail ?? status.surface}</p>
                </div>
              </div>

              <p className="mt-2 text-xs leading-relaxed text-stone-600">
                <strong className="text-stone-700">What it does:</strong> {status.hint}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copy(status.key, `${status.key}=`)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 transition hover:border-brand-400/40 hover:text-brand-600"
                >
                  <Copy size={12} /> {copied === status.key ? 'Copied' : 'Copy the variable name'}
                </button>
                <span className="text-[11px] text-stone-500">Then paste the value after the <span className="font-mono">=</span> and restart.</span>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      <Card className="animate-fade-up">
        <CardTitle icon={<FileCode2 size={16} />}>Where to put them, line by line</CardTitle>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          One file, at the root of the project, next to <span className="font-mono text-xs">package.json</span>. It is
          git-ignored, so nothing you put there is ever committed.
        </p>
        <ol className="mt-4 space-y-3 text-sm text-stone-700">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-700">1</span>
            <span>
              Create the file — copy the committed template, which already lists every variable with a comment:
              <button
                type="button"
                onClick={() => void copy('cmd-copy', 'cp .env.example .env.local')}
                className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl bg-stone-900 px-3.5 py-2.5 text-left font-mono text-xs text-stone-100"
              >
                cp .env.example .env.local
                <ClipboardCopy size={13} className="shrink-0 text-stone-400" />
              </button>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-700">2</span>
            <span>
              Generate the two secrets. Each of these prints 64 random characters — copy the output, do not invent one:
              <button
                type="button"
                onClick={() => void copy('cmd-secrets', 'openssl rand -hex 32')}
                className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl bg-stone-900 px-3.5 py-2.5 text-left font-mono text-xs text-stone-100"
              >
                openssl rand -hex 32
                <ClipboardCopy size={13} className="shrink-0 text-stone-400" />
              </button>
              <span className="mt-1.5 block text-xs text-stone-500">
                One for <span className="font-mono">DUKAANOS_SESSION_SECRET</span>, one for{' '}
                <span className="font-mono">DUKAANOS_ACTIVATION_SECRET</span>. They must be different.
              </span>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-700">3</span>
            <span>
              Fill in the rest in that file, one line each:
              <pre className="mt-2 overflow-x-auto rounded-xl bg-stone-900 px-3.5 py-3 font-mono text-[11px] leading-relaxed text-stone-100">{`DUKAANOS_SESSION_SECRET=<paste the first random string>
DUKAANOS_ACTIVATION_SECRET=<paste the second random string>
NEXT_PUBLIC_PLANS_UPI_ID=yourbusiness@okhdfcbank
NEXT_PUBLIC_PLANS_PAYEE_NAME=Sornio
NEXT_PUBLIC_SUPPORT_WHATSAPP=919876543210
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your anon key>`}</pre>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-700">4</span>
            <span>
              Restart the app, then press <strong>Re-check</strong> above. Every row should go green.
              <button
                type="button"
                onClick={() => void copy('cmd-restart', 'npm run dev')}
                className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl bg-stone-900 px-3.5 py-2.5 text-left font-mono text-xs text-stone-100"
              >
                npm run dev
                <ClipboardCopy size={13} className="shrink-0 text-stone-400" />
              </button>
            </span>
          </li>
        </ol>
        <p className="mt-4 rounded-xl bg-stone-50 px-3.5 py-3 text-xs leading-relaxed text-stone-600 ring-1 ring-inset ring-stone-200">
          On a host (Vercel, Railway, a VPS), the same names go into that host&apos;s environment-variables panel — same
          file, different door. Nothing here is ever typed into the console, and nothing you type into the console can
          change it: that is the point of the split.
        </p>
      </Card>

      {children}

      <Card className="animate-fade-up">
        <CardTitle icon={<ShieldAlert size={16} />}>What we will never ask you for</CardTitle>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          Not your UPI PIN, not an OTP, not a card number, not a bank password, not your Supabase service-role key in a
          chat. A UPI id like <span className="font-mono text-xs">name@okhdfcbank</span> is an address, not a secret — it
          is printed on your shop&apos;s QR code for customers to see. Everything else on this page is a name and a
          format; if anyone asks you for a value, treat it as a red flag and check{' '}
          <Link href="/security" className="font-semibold text-brand-600 underline decoration-dotted">
            the Trust Centre
          </Link>{' '}
          first.
        </p>
      </Card>
    </div>
  );
}
