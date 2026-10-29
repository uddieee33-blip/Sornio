import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { invoke } from './native';
import type { Principal, Role } from './native';
import { errorMessage } from './access';
const roles: { value: Role; label: string }[] = [{ value: 'manager', label: 'Manager' }, { value: 'assistant_manager', label: 'Assistant Manager' }, { value: 'cashier', label: 'Cashier' }];
export function StaffPanel({ disabled, refreshToken = 0, onBusyChange, onDirtyChange }: { disabled: boolean; refreshToken?: number; onBusyChange?: (value: boolean) => void; onDirtyChange?: (value: boolean) => void }) {
  const [staff, setStaff] = useState<Principal[]>([]);
  const [name, setName] = useState(''), [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('cashier'), [edits, setEdits] = useState<Record<string, Role>>({});
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('Loading staff…'), [failed, setFailed] = useState(false);
  const mounted = useRef(false), submitting = useRef(false);
  const dirty = Boolean(name || username || password || Object.entries(edits).some(([id, edited]) => staff.find(person => person.id === id)?.role !== edited));
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { mounted.current = true; let active = true; void invoke<Principal[]>('list_local_staff').then(people => { if (active) setStaff(people); }).catch(error => { if (active) { setFailed(true); setMessage(errorMessage(error, 'Staff could not be loaded.')); } }); return () => { active = false; mounted.current = false; }; }, [refreshToken]);
  async function run(operation: () => Promise<unknown>, success: string) {
    if (submitting.current || disabled) return;
    submitting.current = true; setBusy(true); onBusyChange?.(true); setFailed(false);
    try {
      await operation();
      if (!mounted.current) return;
      setMessage(success); setPassword('');
      const people = await invoke<Principal[]>('list_local_staff');
      if (mounted.current) setStaff(people);
    } catch (error: unknown) { if (mounted.current) { setFailed(true); setMessage(errorMessage(error, 'Staff changes could not be confirmed. Reload staff before retrying.')); } }
    finally { submitting.current = false; if (mounted.current) { setBusy(false); onBusyChange?.(false); setPassword(''); } }
  }
  function create(event: FormEvent) {
    event.preventDefault();
    void run(async () => { await invoke('create_local_staff', { details: { displayName: name, username, role }, password }); if (mounted.current) { setName(''); setUsername(''); } }, 'Staff account created. Share its password privately.');
  }
  function change(person: Principal, enabled: boolean) {
    void run(async () => { await invoke('change_local_staff', { change: { id: person.id, expectedRevision: person.revision, role: edits[person.id] ?? person.role, enabled } }); if (mounted.current) setEdits(values => { const updated = { ...values }; delete updated[person.id]; return updated; }); }, 'Staff updated. Existing sessions for that account must sign in again.');
  }
  return <section className="panel" aria-labelledby="staff-heading" aria-busy={busy}>
    <h2 id="staff-heading">Staff access</h2><p>Only the owner can create accounts or change access. Each person signs in with their own password.</p>
    <p role={failed ? 'alert' : 'status'}>{message}</p>
    <button type="button" disabled={busy || disabled} onClick={() => void run(async () => {}, 'Staff refreshed.')}>Reload staff</button>
    <form onSubmit={create}><fieldset disabled={busy || disabled}><legend>Create staff account</legend>
      <label htmlFor="staff-name">Staff name</label><input id="staff-name" maxLength={80} required value={name} onChange={e => setName(e.target.value)}/>
      <label htmlFor="staff-username">Staff account name</label><input id="staff-username" maxLength={80} pattern="[A-Za-z0-9_-]+" autoComplete="off" required value={username} onChange={e => setUsername(e.target.value)}/>
      <label htmlFor="staff-role">Staff role</label><select id="staff-role" value={role} onChange={e => setRole(e.target.value as Role)}>{roles.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      <label htmlFor="staff-password">Staff password</label><input id="staff-password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)}/>
      <button type="submit">Create staff account</button>
    </fieldset></form>
    <ul aria-label="Local staff accounts">{staff.map(person => <li key={person.id}><p>{person.displayName} · {person.username} · {person.enabled ? 'Enabled' : 'Disabled'}</p>{person.role === 'owner' ? <p>Owner · Protected account</p> : <>
      <label htmlFor={`role-${person.id}`}>Role for {person.username}</label><select id={`role-${person.id}`} disabled={busy || disabled} value={edits[person.id] ?? person.role} onChange={e => setEdits(values => ({ ...values, [person.id]: e.target.value as Role }))}>{roles.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      <button type="button" disabled={busy || disabled} onClick={() => change(person, person.enabled)}>Save role for {person.username}</button>
      <button type="button" disabled={busy || disabled} onClick={() => change(person, !person.enabled)}>{person.enabled ? 'Disable' : 'Enable'} {person.username}</button>
    </>}</li>)}</ul>
  </section>;
}

