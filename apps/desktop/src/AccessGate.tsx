import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { errorCode, errorMessage } from './access';
import type { AccessStatus } from './access';
import { BackupPanel } from './BackupPanel';
import brandIcon from '../../../public/brand/icon-192.png';

export function AccessGate({ children }: { children: (onLocked: (message?: string) => void) => ReactNode }) {
  const native = isTauri();
  const [access, setAccess] = useState<AccessStatus | null>(null);
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const submitting = useRef(false);
  const onLocked = useCallback((detail = '') => {
    setAccess(current => ({ configured: current?.configured ?? true, unlocked: false })); setMessage(detail);
  }, []);

  useEffect(() => {
    if (!native) return;
    let current = true;
    invoke<AccessStatus>('workspace_access_status').then((status) => {
      if (current) setAccess(status);
    }).catch((error: unknown) => {
      if (current) setMessage(errorMessage(error, 'Local access could not be opened. Keep the original database and Windows profile.'));
    });
    return () => { current = false; };
  }, [native, retry]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!native || !access || submitting.current) return;
    if (!access.configured && password !== confirm) { setMessage('The passwords do not match.'); return; }
    submitting.current = true; setBusy(true); setMessage('');
    try {
      const status = await invoke<AccessStatus>(access.configured ? 'unlock_workspace' : 'setup_local_access', { password });
      setAccess(status);
    } catch (error: unknown) {
      setMessage(errorMessage(error, 'Local access could not be opened. Try again.'));
      if (errorCode(error) === 'already_configured' || errorCode(error) === 'not_configured') {
        // A second process may have configured access while this form was open.
        // Recheck without changing its credentials or resetting the database.
        try { setAccess(await invoke<AccessStatus>('workspace_access_status')); } catch { /* Keep the existing error and locked form. */ }
      }
    } finally {
      setPassword(''); setConfirm(''); submitting.current = false; setBusy(false);
    }
  }

  if (native && access?.unlocked) return children(onLocked);
  const setup = access !== null && !access.configured;
  return <main className="access-screen">
    <section className="access-card" aria-labelledby="access-title">
      <div className="wordmark"><img className="brand-mark" src={brandIcon} alt="" width={38} height={38}/>Sornio</div>
      <p className="eyebrow">LOCAL WINDOWS WORKSPACE</p>
      <h1 id="access-title">{!native ? 'Installed app required' : !access ? message ? 'Let’s reopen safely.' : 'Opening local access…' : setup ? 'Make this PC yours.' : 'Welcome back.'}</h1>
      <p className="access-intro">{!native ? 'Open the installed Windows app to use this workspace.' : !access ? 'Your original files stay on this PC.' : setup ? 'Create a local password before opening your sample workspace.' : 'Enter your local password to open the saved workspace on this PC.'}</p>
      {message ? <p className="access-error" role="alert">{message}</p> : null}
      {native && access ? <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy || recoveryBusy}>
          <label htmlFor="local-password">Local password</label>
          <input id="local-password" type="password" autoComplete={setup ? 'new-password' : 'current-password'} autoFocus minLength={setup ? 10 : undefined} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)}/>
          {setup ? <><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" maxLength={128} required value={confirm} onChange={(e) => setConfirm(e.target.value)}/><p className="access-hint">Use 10–128 characters. Keep this password safe: password recovery is not available in this review.</p></> : null}
          <button className="access-submit" type="submit" disabled={busy || !password || (setup && (Array.from(password).length < 10 || !confirm))}>{busy ? 'Opening…' : setup ? 'Set up local access' : 'Unlock workspace'}</button>
        </fieldset>
      </form> : native && message ? <button type="button" className="access-submit" onClick={() => { setMessage(''); setRetry((n) => n + 1); }}>Retry local access</button> : null}
      {native && access ? <BackupPanel allowExport={false} configured={access.configured} disabled={busy} onBusyChange={setRecoveryBusy} onLocked={onLocked} onRestored={() => window.location.reload()}/> : null}
      <p className="access-footnote">Engineering review · Use test data only.<br/>Local access does not create a verified business account.</p>
    </section>
  </main>;
}
