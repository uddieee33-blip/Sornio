'use client';

/**
 * The fingerprint pad at the front desk.
 *
 * Built for the two things that actually happen at a gym's door:
 *
 *   • a member walks in and touches the pad — verify, then check in;
 *   • a member joins and their finger is enrolled once, at the desk.
 *
 * The component is honest about what a browser can do. Where a sensor is
 * reachable it takes a finger; where it is not (a billing PC with no reader) it
 * says so in a sentence and leaves the desk's existing phone lookup untouched —
 * because a queue at the door must never depend on new hardware arriving.
 *
 * Privacy is not a footnote here: the sensor matches the finger in hardware and
 * returns a credential id. This component stores that id, and nothing else.
 */

import { useEffect, useMemo, useState } from 'react';
import { Fingerprint, Info, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { useDukaanStore } from '@/lib/store';
import { useI18n } from '@/lib/i18n';
import { describeDevice, enrollFingerprint, isFingerprintAvailable, verifyFingerprint } from '@/lib/scanning/fingerprint';

type Status = { tone: 'ok' | 'error' | 'info'; text: string } | null;

export function FingerprintPad() {
  const { locale } = useI18n();
  const { state, actions } = useDukaanStore();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [selectedMember, setSelectedMember] = useState('');

  /**
   * Credentials are scoped to a device by WebAuthn itself (a credential id is
   * only meaningful to the authenticator that issued it), so every enrolment is
   * offered and the sensor on *this* device answers for its own. A tablet that
   * only knows three members verifies those three.
   */
  const credentials = state.biometricCredentials;
  const credentialsHere = credentials;

  useEffect(() => {
    let cancelled = false;
    isFingerprintAvailable()
      .then((result) => {
        if (!cancelled) setAvailable(result);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const memberOptions = useMemo(
    () =>
      [...state.members].sort((a, b) => a.name.localeCompare(b.name)),
    [state.members],
  );

  const enrolledMemberIds = new Set(credentials.map((credential) => credential.memberId));

  const note = (tone: 'ok' | 'error' | 'info', text: string) => {
    setStatus({ tone, text });
    window.setTimeout(() => setStatus(null), 6000);
  };

  const verify = async () => {
    setBusy(true);
    setStatus(null);
    const read = await verifyFingerprint({ allowCredentialIds: credentialsHere.map((credential) => credential.credentialId) });
    if (!read.ok) {
      setBusy(false);
      note(read.code === 'unsupported' ? 'info' : 'error', read.error);
      return;
    }
    const result = actions.checkInWithBiometric({ credentialId: read.data.credentialId });
    setBusy(false);
    if (result.ok) {
      const credential = credentialsHere.find((item) => item.credentialId === read.data.credentialId);
      note('ok', `${credential?.memberName ?? 'Member'} is in. The visit is on their record.`);
    } else {
      note('error', result.error ?? 'Could not check in.');
    }
  };

  const enrol = async () => {
    const member = state.members.find((item) => item.id === selectedMember);
    if (!member) {
      note('error', 'Choose the member whose finger you are enrolling.');
      return;
    }
    setBusy(true);
    setStatus(null);
    const created = await enrollFingerprint({
      memberId: member.id,
      memberName: member.name,
      businessName: state.profile.name,
      excludeCredentialIds: credentials
        .filter((credential) => credential.memberId === member.id)
        .map((credential) => credential.credentialId),
    });
    if (!created.ok) {
      setBusy(false);
      note(created.code === 'unsupported' ? 'info' : 'error', created.error);
      return;
    }
    const saved = actions.enrollBiometric({
      memberId: member.id,
      credentialId: created.data.credentialId,
      label: created.data.label,
    });
    setBusy(false);
    if (saved.ok) {
      note('ok', `${member.name}'s finger is enrolled. Next time they touch the pad, the visit is recorded by itself.`);
      setSelectedMember('');
    } else {
      note('error', saved.error ?? 'Could not save the enrolment.');
    }
  };

  const revoke = (credentialId: string, memberName: string) => {
    const result = actions.revokeBiometric(credentialId);
    note(result.ok ? 'ok' : 'error', result.ok ? `${memberName}'s enrolment removed.` : result.error ?? 'Could not remove it.');
  };

  const statusTone =
    status?.tone === 'ok'
      ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20'
      : status?.tone === 'error'
        ? 'bg-red-500/10 text-red-700 ring-red-500/20'
        : 'bg-sky-500/10 text-sky-700 ring-sky-500/20';

  const selectClass =
    'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-portal/50 focus:ring-2 focus:ring-focus';

  return (
    <Card className="animate-fade-up">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon={<Fingerprint size={17} />}>Fingerprint pad</CardTitle>
        {available === null ? (
          <Badge tone="slate">Checking this device…</Badge>
        ) : available ? (
          <Badge tone="emerald" dot>{describeDevice()}</Badge>
        ) : (
          <Badge tone="amber" dot>No sensor here</Badge>
        )}
      </div>

      {available === false ? (
        <p className="rounded-xl bg-amber-500/[0.08] p-3.5 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-500/20">
          This device has no fingerprint sensor the browser can reach — a desktop billing PC usually has none, and that is not a failure.
          Check members in from the list on this page as you always have, or open this console on the front-desk tablet or your phone to
          use the pad.
        </p>
      ) : null}

      {status ? <p className={`mb-3 rounded-xl px-3 py-2.5 text-xs font-semibold ring-1 ring-inset ${statusTone}`}>{status.text}</p> : null}

      <div className={available === false ? 'pointer-events-none mt-4 opacity-50' : 'mt-1'}>
        <div className="rounded-2xl bg-portal/[0.06] p-4 ring-1 ring-inset ring-portal/20">
          <p className="text-xs leading-relaxed text-stone-700">
            A member touches the pad and the visit is recorded on their own record. The finger is verified by the sensor itself.
          </p>
          <Button onClick={verify} disabled={busy || available !== true} className="mt-3 w-full">
            <Fingerprint size={16} /> {busy ? 'Waiting for the finger…' : 'Read finger & check in'}
          </Button>
          {credentialsHere.length === 0 ? (
            <p className="mt-2 text-[11px] leading-relaxed text-stone-600">
              Nobody is enrolled on this device yet — enrol the first member below. It takes one touch.
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-stone-600">
              {credentialsHere.length} finger{credentialsHere.length === 1 ? '' : 's'} enrolled · the sensor verifies, this console only
              learns which member it was
            </p>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-stone-600">
            <UserPlus size={13} /> Enrol a member
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={selectedMember} onChange={(event) => setSelectedMember(event.target.value)} className={selectClass} aria-label="Member to enrol">
              <option value="">Choose a member…</option>
              {memberOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                  {enrolledMemberIds.has(member.id) ? ' (already enrolled)' : ''}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={enrol} disabled={busy || available !== true || !selectedMember} className="sm:w-auto">
              <Fingerprint size={15} /> Enrol finger
            </Button>
          </div>
          {state.members.length === 0 ? (
            <p className="mt-2 text-[11px] text-stone-600">No members on file yet. Add the member first — a finger always belongs to a person.</p>
          ) : null}
        </div>

        {credentials.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-600">Enrolled on this console</p>
            <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
              {credentials.map((credential) => (
                <li key={credential.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-portal/10 text-portal">
                    <Fingerprint size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-stone-900">{credential.memberName}</p>
                    <p className="truncate text-[11px] text-stone-600">
                      {credential.label} · {credential.useCount} visit{credential.useCount === 1 ? '' : 's'}
                      {credential.lastUsedAt ? ` · last ${new Date(credential.lastUsedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => revoke(credential.credentialId, credential.memberName)}
                    className="shrink-0 rounded-lg p-2 text-stone-500 transition hover:bg-red-500/10 hover:text-red-700"
                    aria-label={`Remove ${credential.memberName}'s enrolment`}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 space-y-1.5 rounded-xl bg-stone-50 p-3.5 ring-1 ring-inset ring-stone-200">
          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-stone-600">
            <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-600" />
            No fingerprint is ever captured, stored, or sent anywhere — not an image, not a template. The sensor returns a credential id, and
            deleting that id is the whole of “forget my fingerprint”.
          </p>
          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-stone-600">
            <Info size={13} className="mt-0.5 shrink-0 text-stone-500" />
            A finger identifies a member at the door. It can never move money, and every enrolment and check-in is written to the audit trail
            with who, when, and on which device.
          </p>
        </div>
      </div>
    </Card>
  );
}
