import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { invoke } from './native';
import { errorCode, errorMessage } from './access';
import type { AccessStatus } from './access';
import { setNativeSession } from './native';
import type { LocalSession } from './native';
import brandIcon from '../../../public/brand/icon-192.png';

export function AccessGate({ children }: { children: (onLocked: () => void, session: LocalSession) => ReactNode }) {
  const native = isTauri();
  const [access, setAccess] = useState<AccessStatus | null>(null);
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [username, setUsername] = useState('owner');
  const [business, setBusiness] = useState('');
  const [businessType, setBusinessType] = useState('general');
  const [displayName, setDisplayName] = useState('');
  const [session, setSession] = useState<LocalSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const submitting = useRef(false);
  const onLocked = useCallback(() => {
    setNativeSession(null); setSession(null); setPassword(''); setConfirm('');
    setAccess({ configured: true, unlocked: false }); setMessage('');
  }, []);

  useEffect(() => {
    window.addEventListener('sornio-session-locked', onLocked);
    return () => window.removeEventListener('sornio-session-locked', onLocked);
  }, [onLocked]);
  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => { void invoke('lock_workspace').catch(() => undefined).finally(onLocked); }, 15 * 60 * 1000); };
    reset(); window.addEventListener('pointerdown', reset); window.addEventListener('keydown', reset);
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', reset); window.removeEventListener('keydown', reset); };
  }, [session, onLocked]);
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
      const status = await invoke<AccessStatus>(access.configured ? 'unlock_workspace' : 'setup_local_access', access.configured
        ? { username, password }
        : { setup: { businessName: business, businessType, displayName, username }, password });
      const identity = await invoke<LocalSession>('read_local_session');
      setNativeSession(identity); setSession(identity); setAccess(status);
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

  if (native && access?.unlocked && session) return children(onLocked, session);
  const setup = access !== null && !access.configured;
  return <main className="access-screen">
    <section className="access-card" aria-labelledby="access-title">
      <div className="wordmark"><img className="brand-mark" src={brandIcon} alt="" width={38} height={38}/>Sornio</div>
      <p className="eyebrow">LOCAL WINDOWS WORKSPACE</p>
      <h1 id="access-title">{!native ? 'Installed app required' : !access ? message ? 'Let’s reopen safely.' : 'Opening local access…' : setup ? 'Make this PC yours.' : 'Welcome back.'}</h1>
      <p className="access-intro">{!native ? 'Open the installed Windows app to use this workspace.' : !access ? 'Your original files stay on this PC.' : setup ? 'Set up your business and its owner account on this PC.' : 'Enter your account name and password. Existing review owners use account name owner.'}</p>
      {message ? <p className="access-error" role="alert">{message}</p> : null}
      {native && access ? <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy}>
          {setup ? <>
            <label htmlFor="setup-business">Business name for setup</label><input id="setup-business" maxLength={120} required value={business} onChange={e => setBusiness(e.target.value)}/>
            <label htmlFor="setup-type">Business type for setup</label><select id="setup-type" value={businessType} onChange={e => setBusinessType(e.target.value)}>{['general','kirana','cafe','gym','salon','electronics','boutique','service'].map(type => <option key={type} value={type}>{type}</option>)}</select>
            <label htmlFor="owner-name">Owner name</label><input id="owner-name" maxLength={80} required value={displayName} onChange={e => setDisplayName(e.target.value)}/>
          </> : null}
          <label htmlFor="account-name">Account name</label><input id="account-name" autoComplete="username" maxLength={80} pattern="[A-Za-z0-9_-]+" required value={username} onChange={e => setUsername(e.target.value)}/>
          <label htmlFor="local-password">Local password</label>
          <input id="local-password" type="password" autoComplete={setup ? 'new-password' : 'current-password'} autoFocus minLength={setup ? 10 : undefined} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)}/>
          {setup ? <><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" maxLength={128} required value={confirm} onChange={(e) => setConfirm(e.target.value)}/><p className="access-hint">Use 10–128 characters. Keep this password safe: password recovery is not available in this review.</p></> : null}
          <button className="access-submit" type="submit" disabled={busy || !password || (setup && (Array.from(password).length < 10 || !confirm))}>{busy ? 'Opening…' : setup ? 'Set up local access' : 'Unlock workspace'}</button>
        </fieldset>
      </form> : native && message ? <button type="button" className="access-submit" onClick={() => { setMessage(''); setRetry((n) => n + 1); }}>Retry local access</button> : null}
      <p className="access-footnote">Engineering review · Use test data only.<br/>Identity is verified locally against this encrypted workspace. Cloud verification and LAN pairing are not enabled.</p>
    </section>
  </main>;
}
