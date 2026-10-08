'use client';

/**
 * Who is at this console, and the one button that hands it over.
 *
 * Two shapes, one component, because the same control belongs in three places —
 * the top bar, the sidebar footer, and the mobile drawer — exactly like
 * `AppearanceMenu`. What they share is the *decision*: the name shown here comes
 * from the server-verified session the layout resolved, not from anything in
 * browser storage. `localStorage` can be typed into; the audit trail and this
 * chip both have to be saying the same true thing.
 *
 * What signing out does, and does not, do:
 *
 *   • it clears the `httpOnly` app session, and on a hosted deployment it ends
 *     the provider session **on this device only** (`scope: 'local'` in
 *     `app/api/auth/session`) — the owner's phone keeps its own sign-in, because
 *     a shop that locks up its counter tablet should not log everybody out of the
 *     back office;
 *   • it does not touch the business records. They are this device's, encrypted
 *     in the vault, and the next person to sign in sees the same books. Wiping
 *     data on sign-out would turn "hand the console to the night shift" into
 *     "destroy the month";
 *   • it does navigate hard, through `leaveToSignIn()`, for the reason spelled out
 *     there: the store lives in the root layout and survives a soft route change.
 */

import { useState } from 'react';
import { Loader2, LogOut, UserRound } from 'lucide-react';
import { signOutAndLeave, type RenderedIdentity } from '@/lib/auth/client';

/** `12 Mar, 09:40` — long enough to be useful, short enough for a top bar. */
function endsAt(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1000);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function AccountChip({ identity }: { identity: RenderedIdentity | null }) {
  const [busy, setBusy] = useState(false);

  if (!identity) return null;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signOutAndLeave();
      }}
      title={`Signed in as ${identity.displayName} · ${
        identity.provider === 'local' ? 'this device only' : 'Supabase'
      }`}
      aria-label="Sign out"
      className="touch-manipulation flex h-11 w-11 items-center justify-center gap-1.5 rounded-xl bg-stone-50 text-[11px] font-bold text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-red-500/10 hover:text-red-700 disabled:cursor-wait disabled:opacity-60 md:h-auto md:w-auto md:px-2.5 md:py-1.5"
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
      <span className="hidden md:inline">{busy ? 'Signing out…' : 'Sign out'}</span>
    </button>
  );
}

export function AccountRow({ identity }: { identity: RenderedIdentity | null }) {
  const [busy, setBusy] = useState(false);
  if (!identity) return null;

  const expiry = identity.expiresAt ? endsAt(identity.expiresAt) : '';

  return (
    <div className="rounded-xl bg-stone-50 p-3 ring-1 ring-inset ring-stone-200">
      <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-stone-900">
        <UserRound size={11} className="shrink-0 text-brand-500" />
        {identity.displayName}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-stone-600">
        {identity.provider === 'local' ? 'Local demo mode' : expiry ? `Session ends ${expiry}` : 'Signed in'}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void signOutAndLeave();
        }}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-stone-700 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-700 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}
