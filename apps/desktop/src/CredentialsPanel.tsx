import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { invoke } from './native';
import type { Principal } from './native';
import { errorCode, errorMessage } from './access';

export function CredentialsPanel({ owner, disabled, blockedByDraft, onLocked, onBusyChange, onDirtyChange, onStaffChanged }: {
  owner: boolean; disabled: boolean; blockedByDraft: boolean; onLocked: () => void;
  onBusyChange: (value: boolean) => void; onDirtyChange: (value: boolean) => void; onStaffChanged: () => void;
}) {
  const [current, setCurrent] = useState(''), [next, setNext] = useState(''), [confirm, setConfirm] = useState('');
  const [ownerPassword, setOwnerPassword] = useState(''), [staffPassword, setStaffPassword] = useState(''), [staffConfirm, setStaffConfirm] = useState('');
  const [people, setPeople] = useState<Principal[]>([]), [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [message, setMessage] = useState('Use a private password of 10–128 characters.');
  const mounted = useRef(false), submitting = useRef(false);
  const dirty = Boolean(current || next || confirm || ownerPassword || staffPassword || staffConfirm);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    if (owner) void invoke<Principal[]>('list_local_staff').then(rows => { if (active) setPeople(rows.filter(p => p.role !== 'owner')); }).catch((error: unknown) => {
      if (!active) return;
      if (errorCode(error) === 'locked') onLocked();
      else { setFailed(true); setMessage(errorMessage(error, 'Staff accounts could not be loaded.')); }
    });
    return () => { active = false; mounted.current = false; };
  }, [owner, onLocked]);
  async function reloadStaff() {
    if (submitting.current || disabled || blockedByDraft) return;
    submitting.current = true; setBusy(true); onBusyChange(true);
    try {
      const rows = await invoke<Principal[]>('list_local_staff');
      if (mounted.current) { setPeople(rows.filter(p => p.role !== 'owner')); setFailed(false); setMessage('Staff password accounts refreshed. Review the account before recording another reset.'); }
    } catch (error: unknown) {
      if (!mounted.current) return;
      if (errorCode(error) === 'locked') onLocked();
      else { setFailed(true); setMessage(errorMessage(error, 'Staff password accounts could not be refreshed.')); }
    } finally { submitting.current = false; if (mounted.current) { setBusy(false); onBusyChange(false); } }
  }
  async function save(reset: boolean, event: FormEvent) {
    event.preventDefault();
    if (submitting.current || disabled || blockedByDraft) return;
    const replacement = reset ? staffPassword : next;
    if (replacement !== (reset ? staffConfirm : confirm)) { setFailed(true); setMessage('The new passwords do not match.'); return; }
    const person = people.find(p => p.id === target);
    if (reset && !person) { setFailed(true); setMessage('Choose a staff account.'); return; }
    submitting.current = true; setBusy(true); onBusyChange(true); setFailed(false);
    try {
      if (reset && person) {
        const updated = await invoke<Principal>('reset_local_staff_password', { id: person.id, expectedRevision: person.revision, ownerPassword, newPassword: replacement });
        if (!mounted.current) return;
        setPeople(rows => rows.map(p => p.id === updated.id ? updated : p)); onStaffChanged();
        setMessage('Staff password reset. Existing sessions are locked; disabled accounts remain disabled.');
      } else {
        await invoke('change_local_password', { currentPassword: current, newPassword: replacement });
        if (mounted.current) onLocked();
      }
    } catch (error: unknown) {
      if (!mounted.current) return;
      if (['locked', 'incorrect_password', 'rate_limited'].includes(errorCode(error) ?? '')) { onLocked(); return; }
      setFailed(true);
      setMessage(errorCode(error) === 'workspace_error' || errorCode(error) === 'unavailable'
        ? 'Password change could not be confirmed. Lock and sign in with the new password; if it is not accepted, try the previous password. For a staff reset, reload staff password accounts before retrying.'
        : errorMessage(error, 'Password change could not be confirmed. Lock and sign in again before retrying.'));
    } finally {
      submitting.current = false;
      if (mounted.current) { setBusy(false); onBusyChange(false); setCurrent(''); setNext(''); setConfirm(''); setOwnerPassword(''); setStaffPassword(''); setStaffConfirm(''); }
    }
  }
  const blocked = busy || disabled || blockedByDraft;
  return <section className="panel" aria-labelledby="credentials-heading" aria-busy={busy}>
    <h2 id="credentials-heading">Passwords & access</h2>
    <p>Changing your password locks all your sessions. Sign in again with the new password. Keep it privately; owner password recovery is unavailable.</p>
    {blockedByDraft ? <p>Save or discard other unsaved shop work before changing passwords.</p> : null}
    <p role={failed ? 'alert' : 'status'}>{message}</p>
    <form onSubmit={event => void save(false, event)}><fieldset disabled={blocked}><legend>Change your password</legend>
      <label htmlFor="credential-current">Current account password</label><input id="credential-current" type="password" autoComplete="current-password" maxLength={128} required value={current} onChange={e => setCurrent(e.target.value)}/>
      <label htmlFor="credential-new">New account password</label><input id="credential-new" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={next} onChange={e => setNext(e.target.value)}/>
      <label htmlFor="credential-confirm">Confirm new account password</label><input id="credential-confirm" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={confirm} onChange={e => setConfirm(e.target.value)}/>
      <button type="submit">Change my password and lock</button>
    </fieldset></form>
    {owner ? <form onSubmit={event => void save(true, event)}><fieldset disabled={blocked}><legend>Reset a staff password</legend>
      <button type="button" onClick={() => void reloadStaff()}>Reload staff password accounts</button>
      <label htmlFor="credential-staff">Staff account to reset</label><select id="credential-staff" required value={target} onChange={e => setTarget(e.target.value)}><option value="">Choose an account</option>{people.map(p => <option key={p.id} value={p.id}>{p.displayName} · {p.username} · {p.role.replaceAll('_', ' ')}{p.enabled ? '' : ' · Disabled'}</option>)}</select>
      <label htmlFor="credential-owner">Owner password for reset</label><input id="credential-owner" type="password" autoComplete="current-password" maxLength={128} required value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)}/>
      <label htmlFor="credential-staff-new">New staff password</label><input id="credential-staff-new" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={staffPassword} onChange={e => setStaffPassword(e.target.value)}/>
      <label htmlFor="credential-staff-confirm">Confirm new staff password</label><input id="credential-staff-confirm" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={staffConfirm} onChange={e => setStaffConfirm(e.target.value)}/>
      <button type="submit">Reset staff password</button>
    </fieldset></form> : null}
  </section>;
}
