'use client';

/**
 * The session card — who this device says you are, and how to end or change it.
 *
 * It sits on the same page as the counter PIN on purpose. Those are the two
 * secrets in a DukaanOS install, and they answer two different questions:
 *
 *   • the **counter PIN** proves somebody at this keyboard is the owner, on this
 *     device, against a hash the device holds; and
 *   • the **session** proves this device is allowed to see a business at all, on
 *     the server, and it is what every audit entry is attributed to.
 *
 * Two failure modes follow from confusing them, and both are worth naming: a
 * forgotten PIN has no server-side reset (the answer is to reset the device
 * state), and a forgotten *account* password has no meaning on this device (the
 * answer is a provider email, which is why the field below only exists where
 * there is a provider).
 *
 * The password form is the second half of recovery. A reset link that only signs
 * you back in leaves the stolen password working; this one does not, and the
 * session is re-minted with a fresh id when it succeeds, so the token that was in
 * circulation before the change is not the one that keeps the console open.
 */

import { useState } from 'react';
import { KeyRound, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LIMITS } from '@/lib/security/validation';
import { setNewPassword, signOutAndLeave } from '@/lib/auth/client';
import { useDukaanStore } from '@/lib/store';

const inputClass =
  'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder-stone-400 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus';

function endsAt(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1000);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function SessionCard({ recovery = false }: { recovery?: boolean }) {
  const { identity } = useDukaanStore();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const hosted = identity?.provider === 'supabase';
  const signedInAs = identity ? `Signed in as ${identity.displayName}` : 'Not signed in.';

  const changePassword = async () => {
    if (password.length < LIMITS.minPassword) {
      setMessage({ tone: 'error', text: `Password must be at least ${LIMITS.minPassword} characters.` });
      return;
    }
    if (password !== confirm) {
      setMessage({ tone: 'error', text: 'The two passwords do not match.' });
      return;
    }
    setBusy(true);
    const result = await setNewPassword(password);
    setBusy(false);
    if (result.ok) {
      setPassword('');
      setConfirm('');
      setMessage({ tone: 'ok', text: 'Your password is changed. This device stays signed in; every other one must sign in again.' });
    } else {
      setMessage({ tone: 'error', text: result.error ?? 'The password could not be changed.' });
    }
  };

  return (
    <Card className="animate-fade-up mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <CardTitle icon={<UserRound size={17} />}>Your session</CardTitle>
        <Badge tone={hosted ? 'emerald' : 'amber'} dot>
          {hosted ? 'Supabase' : 'Local demo mode'}
        </Badge>
      </div>

      <div className="rounded-xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
        <p className="flex items-center gap-2 text-sm font-semibold text-stone-800">
          <ShieldCheck size={15} className={hosted ? 'text-emerald-700' : 'text-amber-700'} />
          {signedInAs}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-stone-600">
          {identity?.expiresAt
            ? `This access ends ${endsAt(identity.expiresAt)}${identity.remember ? '' : ', or when you close this browser — whichever comes first'}.`
            : 'This console has no expiring access to show: the session comes from a provider that has not issued one to this app.'}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-stone-600">
          Signing out ends access on this device and leaves your records here, encrypted. It does not delete anything,
          and it does not sign you out on any other device.
        </p>

        <Button
          variant="secondary"
          className="mt-3"
          disabled={leaving}
          onClick={() => {
            setLeaving(true);
            void signOutAndLeave();
          }}
        >
          <LogOut size={15} />
          {leaving ? 'Signing out…' : 'Sign out'}
        </Button>
      </div>

      {recovery || hosted ? (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-stone-600">
            <KeyRound size={12} /> Set a new password
          </p>
          {recovery ? (
            <p className="mb-3 rounded-xl bg-brand-500/10 px-3 py-2.5 text-xs leading-relaxed text-stone-700 ring-1 ring-inset ring-brand-500/20">
              Your reset link worked — this device is signed in. The old password still works until you replace it
              here, so set the new one now.
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="password"
              autoComplete="new-password"
              placeholder={`New password (${LIMITS.minPassword}+ characters)`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Repeat it"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
          </div>
          {message ? (
            <p
              className={`mt-3 rounded-xl px-3 py-2.5 text-sm ring-1 ring-inset ${
                message.tone === 'ok'
                  ? 'bg-emerald-500/10 text-emerald-800 ring-emerald-500/20'
                  : 'bg-red-500/10 text-red-700 ring-red-500/20'
              }`}
            >
              {message.text}
            </p>
          ) : null}
          <Button className="mt-3" disabled={busy || !password || !confirm} onClick={() => void changePassword()}>
            {busy ? 'Checking…' : 'Change password'}
          </Button>
          <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
            {hosted
              ? 'The change is made by Supabase — this app never stores a password, so it cannot show you the old one.'
              : 'This build has no account to change: there is no auth provider configured. The secret on this device is the counter PIN above.'}
          </p>
        </div>
      ) : null}
    </Card>
  );
}
