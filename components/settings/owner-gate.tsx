'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, Crown, KeyRound, Loader2, Lock, Store, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCounterLock } from '@/components/security/counter-lock';
import { PIN_LENGTH } from '@/lib/security/lock';
import type { StaffRole } from '@/lib/models/business';
import { useDukaanStore } from '@/lib/store';

export const ROLE_META: Record<StaffRole, { label: string; tagline: string; detail: string; icon: typeof Crown }> = {
  owner: {
    label: 'Owner',
    tagline: 'Everything, no questions',
    detail: 'Change settings, the business profile, and data — the console trusts you completely.',
    icon: Crown,
  },
  manager: {
    label: 'Manager',
    tagline: 'Runs the day, not the setup',
    detail: 'Sales, billing, collections, members. Settings, profile, and reset ask for the owner password.',
    icon: Briefcase,
  },
  desk: {
    label: 'Front desk',
    tagline: 'Billing counter only',
    detail: 'Raise bills and collect payments. Setup changes ask for the owner password; reset and server setup stay hidden.',
    icon: Store,
  },
};

/**
 * The owner-password prompt.
 *
 * There is exactly one password on this console — the 6-digit counter PIN set
 * on the Security page. Reusing it (instead of inventing a second secret)
 * means there is only one thing to remember and only one thing to reset.
 */
export function OwnerPinModal({
  reason,
  onVerified,
  onClose,
}: {
  /** One plain sentence: what is this password unlocking? */
  reason: string;
  onVerified: () => void;
  onClose: () => void;
}) {
  const lock = useCounterLock();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const submit = async () => {
    if (pin.length !== PIN_LENGTH) {
      setError(`The owner password is ${PIN_LENGTH} digits.`);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await lock.unlock(pin);
    setBusy(false);
    if (result.ok) {
      setPin('');
      onVerified();
    } else {
      setError(result.error ?? 'That password did not match. Try again.');
    }
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Owner password required"
    >
      <div
        className="animate-collect-pop relative w-full max-w-sm overflow-hidden rounded-t-3xl border border-stone-200 bg-panel p-6 shadow-2xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-brand-gradient" />
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition hover:bg-stone-200 hover:text-stone-900 active:scale-95"
        >
          <X size={17} />
        </button>

        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/25">
          <Lock size={20} />
        </span>
        <h2 className="mt-3 font-display text-lg font-bold text-stone-900">Owner password needed</h2>
        <p className="mt-1 text-sm leading-relaxed text-stone-600">{reason}</p>

        {!lock.enabled ? (
          <div className="mt-5 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/[0.07] p-4 text-center">
            <KeyRound size={22} className="mx-auto text-amber-700" />
            <p className="mt-2 text-sm font-semibold text-stone-800">No owner password yet</p>
            <p className="mt-1 text-xs leading-relaxed text-stone-600">
              Set the 6-digit counter PIN once — it locks the console and guards the settings, both.
            </p>
            <Link
              href="/security"
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 active:scale-[0.98]"
            >
              Set it on the Security page
            </Link>
          </div>
        ) : (
          <>
            <label className="mb-2 mt-5 block text-[11px] font-bold uppercase tracking-[0.16em] text-stone-600">
              {PIN_LENGTH}-digit owner password
            </label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="••••••"
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-center font-mono text-lg tracking-[0.4em] text-stone-900 placeholder-stone-400 outline-none transition focus:border-portal/50 focus:ring-2 focus:ring-focus"
            />
            {error ? (
              <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2.5 text-sm text-red-700 ring-1 ring-inset ring-red-500/20">
                {error}
              </p>
            ) : null}
            <Button onClick={() => void submit()} disabled={busy || pin.length !== PIN_LENGTH} className="mt-4 w-full">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
              {busy ? 'Checking…' : 'Unlock this change'}
            </Button>
            <p className="mt-3 text-center text-xs text-stone-500">
              Forgot it? <Link href="/security" className="font-semibold text-stone-700 underline underline-offset-4">Reset it on the Security page</Link>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

type PendingChange = { reason: string; run: () => void } | null;

/**
 * One hook for every guarded control: `requestOwner(reason, fn)` runs `fn`
 * immediately for the owner, and asks for the owner password first for
 * everyone else. Render `modal` once at the bottom of the page.
 */
export function useOwnerGate() {
  const { state } = useDukaanStore();
  const [pending, setPending] = useState<PendingChange>(null);

  const role: StaffRole = state.settings.activeRole ?? 'owner';

  const requestOwner = (reason: string, run: () => void) => {
    if (role === 'owner') {
      run();
      return;
    }
    setPending({ reason, run });
  };

  const modal = pending ? (
    <OwnerPinModal
      reason={pending.reason}
      onClose={() => setPending(null)}
      onVerified={() => {
        const run = pending.run;
        setPending(null);
        run();
      }}
    />
  ) : null;

  return { role, modal, requestOwner };
}
