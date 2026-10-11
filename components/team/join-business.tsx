'use client';

/**
 * "Join a business with an invite code" — the teammate's side of team setup.
 *
 * Rendered wherever an unscoped account might land: below the onboarding
 * wizard (a new teammate must not be forced to invent a business they do not
 * own) and on the Team screen itself. It only offers itself when the
 * deployment can actually redeem a code — in local-first mode there is nothing
 * to join, and saying so up front saves a pointless error round-trip.
 *
 * The code input auto-formats to the `DKN-XXXX-XXXX` shape the owner was
 * shown; formatting is presentation only — the server re-normalises.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, KeyRound, LogIn } from 'lucide-react';

import { redeemInviteCode } from '@/lib/team/client';

function displayForm(raw: string): string {
  const symbols = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^DKN/, '').slice(0, 8);
  if (symbols.length === 0) return '';
  const head = symbols.slice(0, 4);
  const tail = symbols.slice(4);
  return `DKN-${head}${tail ? `-${tail}` : ''}`;
}

export function JoinBusiness({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<'unknown' | 'supabase' | 'local'>('unknown');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ businessName: string | null; roleLabel: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        setMode(payload?.mode === 'supabase' ? 'supabase' : 'local');
      })
      .catch(() => {
        if (!cancelled) setMode('local');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // No sync, nothing to join — hide rather than taunt.
  if (mode === 'local') return null;

  const ready = code.replace(/[^A-Z0-9]/gi, '').replace(/^DKN/i, '').length === 8;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await redeemInviteCode(code);
    setBusy(false);
    if (!result.ok) return setError(result.error ?? 'Could not redeem the code.');
    setJoined({ businessName: result.businessName ?? null, roleLabel: result.roleLabel ?? 'Teammate' });
    // The redeem route re-minted the session cookie with the tenant and role;
    // refresh so every server-rendered screen sees it before navigating.
    router.refresh();
    setTimeout(() => router.push('/home'), 1200);
  };

  if (joined) {
    return (
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-4 text-sm text-emerald-900 animate-fade-in" role="status">
        <p className="flex items-center gap-2 font-semibold">
          <CheckCircle2 size={16} className="text-emerald-700" />
          Welcome aboard{joined.businessName ? ` — ${joined.businessName}` : ''}.
        </p>
        <p className="mt-1 text-xs text-emerald-800">You joined as {joined.roleLabel}. Taking you to the console…</p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-stone-200 bg-stone-50 ${compact ? 'p-4' : 'p-5'}`}>
      <p className="flex items-center gap-2 text-sm font-semibold text-stone-800">
        <KeyRound size={15} className="text-brand-600" />
        Joining an existing business?
      </p>
      <p className="mt-1 text-xs leading-relaxed text-stone-600">
        If the owner gave you an invite code, sign in with <em>your own</em> email first, then enter it here.
        Your role comes with the code — the owner decides it, not this screen.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={code}
          onChange={(event) => setCode(displayForm(event.target.value))}
          placeholder="DKN-XXXX-XXXX"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          aria-label="Invite code"
          className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 font-mono text-sm tracking-widest text-stone-900 placeholder-stone-400 outline-hidden transition focus:border-brand-500/50 focus:ring-2 focus:ring-focus"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!ready || busy || mode !== 'supabase'}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LogIn size={15} />
          {busy ? 'Joining…' : 'Join business'}
        </button>
      </div>
      {error ? (
        <p className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-500/20 animate-fade-in" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
