'use client';

/**
 * The owner's actual team console — the screen that answers "who is using this
 * app, and as what?".
 *
 * Flow this screen exists for, end to end:
 *
 *   1. Owner picks a role, taps "Create invite code" → the code appears once.
 *   2. Owner sends it to the teammate (WhatsApp, a note, spoken — it expires).
 *   3. Teammate installs/opens DukaanOS, signs up with their *own* email, and
 *      enters the code. From that moment every device knows them by role.
 *   4. Owner sees the seat appear in Members, can change the role or remove it.
 *
 * What the screen deliberately refuses to show: the other person's password
 * (it never touches this app — each teammate keeps their own), and any way to
 * grant a second Owner. An extra owner is an ownership transfer, and that is a
 * deliberate ceremony for a later day, not a dropdown.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Crown, KeyRound, Mail, RefreshCw, Shield, Trash2, UserMinus, Users } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Card, CardTitle } from '@/components/ui/Card';
import { ROLE_LABELS, type Role } from '@/lib/security/rbac';
import { INVITABLE_ROLES } from '@/lib/team/roles';
import {
  changeMemberRole,
  createInvite,
  loadTeam,
  removeMember,
  revokeInvite,
  type MintedInvite,
  type TeamMember,
  type TeamState,
} from '@/lib/team/client';
import { JoinBusiness } from './join-business';

const inputClass =
  'w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 placeholder-stone-500 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-600';

function roleTone(role: Role): 'brand' | 'emerald' | 'sky' | 'slate' {
  return role === 'owner' ? 'brand' : role === 'manager' ? 'emerald' : role === 'cashier' ? 'sky' : 'slate';
}

function formatInstant(iso: string | null): string {
  if (!iso) return '—';
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '—';
  return instant.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function TeamManager() {
  const router = useRouter();
  const [state, setState] = useState<TeamState | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [fault, setFault] = useState<string | null>(null);

  const [inviteRole, setInviteRole] = useState<Role>('cashier');
  const [inviteLabel, setInviteLabel] = useState('');
  const [minted, setMinted] = useState<MintedInvite | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<TeamMember | null>(null);

  const refresh = useCallback(async () => {
    const result = await loadTeam();
    setState(result);
  }, []);

  useEffect(() => {
    // Microtask: the rule (and the repo's own convention) is that effects may
    // *start* work, not synchronously set state during render-commit.
    queueMicrotask(() => void refresh());
  }, [refresh]);

  useEffect(() => {
    // Joining/re-scoping changes the session cookie; make sure the rest of the
    // console re-renders against it. Cheap when nothing changed.
    if (state && !state.ok) return;
    router.refresh();
  }, [state, router]);

  const run = async (action: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    setBusy(true);
    setFault(null);
    setNotice(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setFault(result.error ?? 'Something went wrong. Please try again.');
      return false;
    }
    setNotice(done);
    await refresh();
    return true;
  };

  const mintInvite = async () => {
    setBusy(true);
    setFault(null);
    setCopied(false);
    const result = await createInvite({ role: inviteRole, label: inviteLabel.trim() });
    setBusy(false);
    if (!result.ok || !result.invite) return setFault(result.error ?? 'Could not create the invite.');
    setMinted(result.invite);
    setInviteLabel('');
    await refresh();
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false); // non-secure context: the code stays visible for manual copy
    }
  };

  /* ---------------------------------------------------------- states ---- */

  if (!state) {
    return (
      <Card className="mb-6">
        <p className="flex items-center gap-2 text-sm text-stone-600">
          <RefreshCw size={15} className="animate-spin" /> Loading your team…
        </p>
      </Card>
    );
  }

  if (!state.ok) {
    return (
      <Card className="mb-6 border-red-500/25">
        <p className="text-sm font-semibold text-red-700">{state.error}</p>
        <button type="button" onClick={() => void refresh()} className="mt-3 rounded-xl border border-stone-200 px-3.5 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50">
          Try again
        </button>
      </Card>
    );
  }

  if (state.state === 'local') {
    return (
      <Card className="mb-6">
        <div className="flex items-start gap-3">
          <Shield size={18} className="mt-0.5 shrink-0 text-brand-600" />
          <div>
            <CardTitle icon={<Users size={17} />}>Team accounts need sync</CardTitle>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">{state.message}</p>
            <p className="mt-2 text-xs leading-relaxed text-stone-500">
              Once sync is on: each teammate signs in with their own email on their own device, the owner hands each a
              role from this screen, and every device shows the same business, live.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (state.state === 'unscoped') {
    return (
      <Card className="mb-6">
        <CardTitle icon={<KeyRound size={17} />}>Not part of a business yet</CardTitle>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">{state.message}</p>
        <div className="mt-4">
          <JoinBusiness compact />
        </div>
      </Card>
    );
  }

  if (state.state === 'readonly') {
    return (
      <Card className="mb-6">
        <div className="flex items-center gap-3">
          <Shield size={18} className="shrink-0 text-stone-500" />
          <div>
            <p className="text-sm font-semibold text-stone-800">
              You are signed in as <Badge tone={roleTone(state.role)}>{state.roleLabel}</Badge>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-stone-600">
              Only the owner manages the team. Your access is decided by your role — the matrix below shows exactly what it covers.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  /* ----------------------------------------------------------- ready ---- */

  const { members, invites, business } = state;

  return (
    <div className="mb-6 space-y-4">
      {(notice || fault) && (
        <p
          role={fault ? 'alert' : 'status'}
          className={`rounded-2xl px-4 py-3 text-xs font-semibold animate-fade-in ${
            fault ? 'bg-red-500/10 text-red-700 ring-1 ring-inset ring-red-500/20' : 'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/20'
          }`}
        >
          {fault ?? notice}
        </p>
      )}

      {/* ---- Invite ---- */}
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <CardTitle icon={<KeyRound size={17} />}>Invite a teammate</CardTitle>
          <Badge tone="slate" dot>
            codes expire in 72h
          </Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <span className={labelClass}>Their role</span>
            <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)} className={inputClass}>
              {INVITABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className={labelClass}>Who is it for? (optional)</span>
            <input value={inviteLabel} onChange={(event) => setInviteLabel(event.target.value)} maxLength={60} placeholder="Cashier — Ravi" className={inputClass} />
          </div>
          <button
            type="button"
            onClick={() => void mintInvite()}
            disabled={busy}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create invite code
          </button>
        </div>

        {minted ? (
          <div className="mt-4 rounded-2xl border border-brand-500/25 bg-brand-500/[0.06] p-4 animate-fade-up">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Give this code to {minted.label ?? 'your teammate'} — shown once</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <code className="rounded-xl bg-white px-4 py-2.5 font-mono text-lg font-bold tracking-[0.2em] text-stone-900 ring-1 ring-inset ring-stone-200">{minted.code}</code>
              <button
                type="button"
                onClick={() => void copyCode(minted.code)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
              >
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <span className="text-xs text-stone-500">valid until {formatInstant(minted.expiresAt)}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-stone-600">
              They sign up with their own email and enter this code once. Anyone holding it joins as{' '}
              <span className="font-semibold">{minted.roleLabel}</span> — share it like a key, not like a poster.
            </p>
          </div>
        ) : null}

        {invites.length > 0 ? (
          <div className="mt-4 border-t border-stone-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Waiting to be used</p>
            <ul className="space-y-2">
              {invites.map((invite) => (
                <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-stone-50 px-3.5 py-2.5 ring-1 ring-inset ring-stone-200/60">
                  <span className="flex items-center gap-2 text-sm font-medium text-stone-800">
                    <Mail size={14} className="text-stone-500" />
                    {invite.label ?? 'Unlabelled invite'}
                    <Badge tone={roleTone(invite.role)}>{invite.roleLabel}</Badge>
                  </span>
                  <span className="flex items-center gap-3 text-xs text-stone-500">
                    expires {formatInstant(invite.expiresAt)}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run(() => revokeInvite(invite.id), 'Invite revoked.')}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-red-600 transition hover:bg-red-500/10 disabled:opacity-50"
                    >
                      <Trash2 size={13} /> Revoke
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {/* ---- Members ---- */}
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <CardTitle icon={<Users size={17} />}>Members{business.name ? ` — ${business.name}` : ''}</CardTitle>
          <Badge tone="brand" dot>
            {members.length} {members.length === 1 ? 'seat' : 'seats'}
          </Badge>
        </div>
        <ul className="divide-y divide-stone-100">
          {members.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-stone-900">
                  {member.role === 'owner' ? <Crown size={14} className="text-brand-600" /> : null}
                  <span className="truncate">{member.email ?? 'Account unavailable'}</span>
                  {member.you ? <Badge tone="slate">you</Badge> : null}
                </p>
                <p className="mt-0.5 text-xs text-stone-500">added {formatInstant(member.addedAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                {member.you || member.role === 'owner' ? (
                  <Badge tone={roleTone(member.role)} dot>
                    {member.roleLabel}
                  </Badge>
                ) : (
                  <>
                    <select
                      aria-label={`Role for ${member.email ?? 'teammate'}`}
                      value={member.role}
                      disabled={busy}
                      onChange={(event) =>
                        void run(() => changeMemberRole(member.userId, event.target.value as Role), `Role updated to ${ROLE_LABELS[event.target.value as Role]}.`)
                      }
                      className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-800 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus disabled:opacity-50"
                    >
                      {INVITABLE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                    {confirmRemove?.userId === member.userId ? (
                      <span className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setConfirmRemove(null);
                            void run(() => removeMember(member.userId), `${member.email ?? 'Teammate'} removed from the team.`);
                          }}
                          className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button type="button" disabled={busy} onClick={() => setConfirmRemove(null)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-stone-600 transition hover:bg-stone-100">
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmRemove(member)}
                        aria-label={`Remove ${member.email ?? 'teammate'} from the team`}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-500/10 disabled:opacity-50"
                      >
                        <UserMinus size={14} /> Remove
                      </button>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-start gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-3.5 text-xs leading-relaxed text-stone-600">
          <Shield size={14} className="mt-0.5 shrink-0" />
          Removing someone ends their access on every device the next time it talks to the server. The data they entered
          stays — attributed to them in the audit trail, so “who billed this” always has an answer.
        </p>
      </Card>
    </div>
  );
}
