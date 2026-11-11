import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { isTauri } from '@tauri-apps/api/core';
import { invoke } from './native';
import type { PortalId } from '../../../packages/business-domain/src/business-types';
import { profileForPortal } from '../../../packages/business-domain/src/business-profiles';
import { dailyWorkspace } from '../../../packages/business-domain/src/daily-workspace';
import { SavedCopies } from './SavedCopies';
import { InventoryPanel } from './InventoryPanel';
import { RetailPanel } from './RetailPanel';
import { CustomerPanel } from './CustomerPanel';
import { StaffPanel } from './StaffPanel';
import { BackupPanel } from './BackupPanel';
import { CredentialsPanel } from './CredentialsPanel';
import type { LocalSession } from './native';
import { CheckoutPanel } from './CheckoutPanel';
import { AccessGate } from './AccessGate';
import { errorCode, errorMessage } from './access';
import type { Draft, Snapshot } from './workspace-types';
import brandIcon from '../../../public/brand/icon-192.png';
import './style.css';

const empty: Draft = { businessName: '', businessType: 'kirana', note: '' };
const types = [
  ['kirana', 'Grocery & kiryana'], ['general', 'General store'], ['cafe', 'Café & restaurant'],
  ['gym', 'Gym & fitness'], ['salon', 'Salon'], ['electronics', 'Electronics'],
  ['boutique', 'Boutique'], ['service', 'Services'],
] as const satisfies ReadonlyArray<readonly [PortalId, string]>;

function App({ onLocked, session }: { onLocked: (detail?: string) => void; session: LocalSession }) {
  const [screen, setScreen] = useState('counter');
  const owner = session.principal.role === 'owner';
  const canAdd = session.principal.role !== 'cashier';
  const canCorrect = owner || session.principal.role === 'manager';
  const native = isTauri();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [status, setStatus] = useState<'opening' | 'ready' | 'saving' | 'error'>(native ? 'opening' : 'error');
  const [message, setMessage] = useState(native ? 'Opening your local workspace…' : 'Open the installed Windows app to use the local workspace.');
  const saving = useRef(false);
  const [reopenPrompt, setReopenPrompt] = useState(false);
  const [lockPrompt, setLockPrompt] = useState(false);
  const continueLockRef = useRef<HTMLButtonElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => { if (lockPrompt) continueLockRef.current?.focus(); }, [lockPrompt]);
  useEffect(() => { if (reopenPrompt) keepEditingRef.current?.focus(); }, [reopenPrompt]);
  function dismissPrompt(kind: 'lock' | 'reopen') {
    if (kind === 'lock') setLockPrompt(false); else setReopenPrompt(false);
    const previous = restoreFocusRef.current;
    restoreFocusRef.current = null;
    queueMicrotask(() => {
      if (previous?.isConnected) previous.focus();
      else document.getElementById('checkout-search')?.focus();
    });
  }
  const [backupBusy, setBackupBusy] = useState(false), [backupDirty, setBackupDirty] = useState(false);
  const [catalogDirty, setCatalogDirty] = useState(false);
  const [credentialDirty, setCredentialDirty] = useState(false), [credentialBusy, setCredentialBusy] = useState(false), [staffRefresh, setStaffRefresh] = useState(0);
  const [staffDirty, setStaffDirty] = useState(false), [staffBusy, setStaffBusy] = useState(false);
  const staffChanged = useCallback(() => setStaffRefresh(value => value + 1), []);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [checkoutDirty, setCheckoutDirty] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [customerBusy, setCustomerBusy] = useState(false);
  const [customerDirty, setCustomerDirty] = useState(false);
  const [retailBusy, setRetailBusy] = useState(false), [retailDirty, setRetailDirty] = useState(false), [retailRefresh, setRetailRefresh] = useState(0);
  const [customerRefresh, setCustomerRefresh] = useState(0);
  const [inventoryRefresh, setInventoryRefresh] = useState(0);
  const [checkoutRefresh, setCheckoutRefresh] = useState(0);
  const refreshInventory = useCallback(() => { setInventoryRefresh(value => value + 1); setCustomerRefresh(value => value + 1); setRetailRefresh(value => value + 1); }, []);
  const refreshCheckout = useCallback(() => { setCheckoutRefresh(value => value + 1); setRetailRefresh(value => value + 1); }, []);
  const retailChanged = useCallback(() => { setCheckoutRefresh(value => value + 1); setInventoryRefresh(value => value + 1); setCustomerRefresh(value => value + 1); }, []);
  const draftDirty = snapshot !== null && JSON.stringify(draft) !== JSON.stringify(snapshot.draft ?? empty);
  const otherDirty = backupDirty || staffDirty || catalogDirty || draftDirty || checkoutDirty || customerDirty || retailDirty;
  const dirty = otherDirty || credentialDirty;

  useEffect(() => {
    if (!native) return;
    let current = true;
    invoke<Snapshot>('load_workspace').then((saved) => {
      if (!current) return;
      setSnapshot(saved); setDraft(saved.draft ?? empty); setStatus('ready');
      setMessage(saved.draft ? 'Your saved draft is ready on this PC.' : 'Your local workspace is ready.');
    }).catch((error: unknown) => {
      if (current) {
        if (errorCode(error) === 'locked') { onLocked(); return; }
        setStatus('error'); setMessage(errorMessage(error, 'The local workspace could not be opened.'));
      }
    });
    return () => { current = false; };
  }, [native, onLocked]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!native || !snapshot || saving.current || !draftDirty) return;
    saving.current = true; setStatus('saving'); setMessage('Saving to this PC…');
    try {
      const saved = await invoke<Snapshot>('save_workspace', { expectedRevision: snapshot.revision, draft });
      setSnapshot(saved); setDraft(saved.draft ?? empty); setStatus('ready'); setMessage('Saved to this PC. You can close and reopen Sornio.');
    } catch (error: unknown) {
      if (errorCode(error) === 'locked') { onLocked(); return; }
      setStatus('error'); setMessage(errorMessage(error, 'The draft could not be saved. Keep this window open and try again.'));
    } finally { saving.current = false; }
  }

  async function reopen() {
    if (!native || saving.current) return;
    saving.current = true; setReopenPrompt(false); setStatus('opening'); setMessage('Reopening the saved draft…');
    try {
      const saved = await invoke<Snapshot>('load_workspace');
      setSnapshot(saved); setDraft(saved.draft ?? empty); setStatus('ready'); setMessage('Reopened the latest saved draft from this PC.');
    } catch (error: unknown) {
      if (errorCode(error) === 'locked') { onLocked(); return; }
      setStatus('error'); setMessage(errorMessage(error, 'The saved draft could not be reopened. Your edits are still in this window.'));
    } finally { saving.current = false; }
  }

  async function restore(sourceRevision: number) {
    if (!native || !snapshot || saving.current || draftDirty) return;
    saving.current = true; setStatus('saving'); setMessage('Restoring your saved copy…');
    try {
      const saved = await invoke<Snapshot>('restore_workspace', { expectedRevision: snapshot.revision, sourceRevision });
      setSnapshot(saved); setDraft(saved.draft ?? empty); setStatus('ready');
      setMessage(`Restored saved copy ${sourceRevision} as revision ${saved.revision}.`);
    } catch (error: unknown) {
      if (errorCode(error) === 'locked') { onLocked(); return; }
      setStatus('error'); setMessage(errorMessage(error, 'The saved copy could not be restored. Your current draft has been kept.'));
    } finally { saving.current = false; }
  }

  const profile = profileForPortal(snapshot?.draft?.businessType ?? 'kirana');
  const navigation = [ ['counter', profile.counterLabel], ['stock', profile.itemLabel], ['customers', profile.customerLabel], ['day', 'Returns & cash closing'], ...(owner ? [['team', 'Team'], ['backup', 'Backup & recovery']] : []), ['settings', 'Business settings'] ];
  function navigate(id: string) { setScreen(id); queueMicrotask(() => document.getElementById('workspace-page-title')?.focus()); }
  const busy = backupBusy || staffBusy || credentialBusy || retailBusy || customerBusy || checkoutBusy || catalogBusy || status === 'opening' || status === 'saving';

  async function lock(discard = false) {
    if (!native || saving.current || busy) return;
    if (dirty && !discard) {
      restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setLockPrompt(true);
      return;
    }
    saving.current = true; setStatus('saving'); setMessage('Locking this workspace…');
    try { await invoke('lock_workspace'); onLocked(); }
    catch (error: unknown) { setStatus('error'); setMessage(errorMessage(error, 'The workspace could not be locked. Keep this window open and retry.')); }
    finally { saving.current = false; }
  }

  return <div className="desktop-shell">
    <aside className="rail">
      <a className="wordmark" href="#main" aria-label="Sornio workspace"><img className="brand-mark" src={brandIcon} alt="" width={38} height={38}/>Sornio</a>
      <div className="workspace-name"><span className="eyebrow">THIS DEVICE</span><strong>Local workspace</strong><span>{profile.title}</span></div>
      <nav aria-label="Workspace">{navigation.map(([id, label]) => <button type="button" key={id} aria-current={screen === id ? 'page' : undefined} className={screen === id ? 'selected' : ''} disabled={busy} onClick={() => navigate(id)}>{label}</button>)}</nav>
      <div className="rail-bottom"><span className="status-dot"/> Built for your counter.<p>Local review · 0.3.0</p></div>
    </aside>
    <main id="main">
      <header className="topbar"><span>{session.businessName} · {session.principal.displayName} · {session.principal.role.replaceAll("_", " ")}</span><div className="topbar-actions"><span className="chip"><span className="status-dot"/> On this PC</span><button type="button" className="quiet-button" disabled={busy} onClick={() => void lock()}>Lock workspace</button></div></header>
      <div className="page">
        <div className="heading"><div><p className="eyebrow">SORNIO · LOCAL WORKSPACE</p><h1 id="workspace-page-title" tabIndex={-1}>{navigation.find(([id]) => id === screen)?.[1]}</h1><p className="intro">{profile.title} · {screen === 'counter' ? 'Scan items, take payment and serve the next customer.' : 'Your work stays on this device.'}</p></div><span className="review-label">Development build<br/>Use test data only</span></div>
        <section className="status-panel" aria-label="Local storage status"><span className="status-icon" aria-hidden="true">↳</span><div><strong>{status === 'opening' ? 'Opening local storage' : snapshot ? 'Your draft stays on this device' : native ? 'Local storage needs attention' : 'Installed app required'}</strong><p role={status === 'error' ? 'alert' : 'status'} aria-live="polite">{message}</p></div><span className="revision">{snapshot ? `Revision ${snapshot.revision}` : 'Local only'}</span></section>
        {lockPrompt ? <section className="panel lock-prompt" role="group" aria-label="Lock unsaved workspace" onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); dismissPrompt('lock'); } }}><p>Locking will discard your unsaved edits. Save them first, or discard them to lock.</p><button ref={continueLockRef} className="quiet-button" type="button" disabled={busy} onClick={() => dismissPrompt('lock')}>Continue editing</button><button type="button" disabled={busy} onClick={() => void lock(true)}>Discard edits and lock</button></section> : null}
        <div hidden={screen !== 'counter'}>{native && snapshot ? <CheckoutPanel username={session.principal.username} customerRefreshToken={customerRefresh} disabled={busy || screen !== 'counter'} refreshToken={checkoutRefresh} onLocked={onLocked} onDirtyChange={setCheckoutDirty} onBusyChange={setCheckoutBusy} onPosted={refreshInventory}/> : null}</div>
        <div className="workspace-grid" hidden={screen !== 'settings'}>
          {owner ? <form className="panel" onSubmit={(event) => void save(event)}>
            <div className="panel-heading"><div><p className="eyebrow">FIRST WORKSPACE</p><h2>Keep a local draft.</h2></div><span className="small-chip">{draftDirty ? 'Unsaved changes' : snapshot?.draft ? 'Saved' : 'New draft'}</span></div>
            <p className="muted">Save a sample business and note, then reopen the app without internet to check that it stays here.</p>
            <fieldset disabled={!snapshot || busy}>
              <label htmlFor="business-name">Business name</label><input id="business-name" autoComplete="organization" value={draft.businessName} maxLength={120} required placeholder="Your sample business" onChange={(e) => setDraft({ ...draft, businessName: e.target.value })}/>
              <label htmlFor="business-type">Business type</label><select aria-describedby="business-description" id="business-type" value={draft.businessType} onChange={(e) => setDraft({ ...draft, businessType: e.target.value as PortalId })}>{types.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
              <p id="business-description">{dailyWorkspace(draft.businessType).description}</p><ol>{profileForPortal(draft.businessType).onboarding.map(step => <li key={step}>{step}</li>)}</ol><p className="muted">In development: {profileForPortal(draft.businessType).planned.join(', ')}.</p>
              <label htmlFor="workspace-note">Workspace note</label><textarea id="workspace-note" rows={5} maxLength={2000} placeholder="A note to find when you reopen Sornio…" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })}/>
              <div className="form-footer"><p>{draftDirty ? 'Changes are not saved yet.' : 'Nothing leaves this PC in this build.'}</p><button type="submit" disabled={!draftDirty || !draft.businessName.trim()}>{status === 'saving' ? 'Saving…' : 'Save local draft'}<span aria-hidden="true">↗</span></button></div>
            </fieldset>
            {native ? <div className="reopen-actions">
              {reopenPrompt ? <div className="reopen-prompt" role="group" aria-label="Reopen saved draft" onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); dismissPrompt('reopen'); } }}>
                <p>Your unsaved edits will be replaced by the latest saved draft.</p>
                <button ref={keepEditingRef} type="button" className="quiet-button" disabled={busy} onClick={() => dismissPrompt('reopen')}>Keep editing</button>
                <button type="button" disabled={busy} onClick={() => void reopen()}>Discard edits and reopen</button>
              </div> : <button className="quiet-button" type="button" disabled={busy} onClick={() => { if (draftDirty) { restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setReopenPrompt(true); } else void reopen(); }}>Reopen saved draft</button>}
            </div> : null}
          </form> : null}
          <aside className="side-panel"><p className="eyebrow">A STRONGER FOUNDATION</p><h2>A home on<br/>your desktop.</h2><p>The app screens are included in the Windows package. Opening this workspace does not load the public website.</p><div className="divider"/><h3>What this review includes</h3><ul><li>Local draft save and reopen</li><li>Encrypted device storage</li><li>Password lock and unlock</li><li>Local item and stock entry</li><li>Cash and credit checkout</li></ul><p className="footnote">Owner and staff access is enforced on this PC. LAN pairing and cloud backup are not enabled. This review does not replace your current business records.</p></aside>
        </div>
        <div hidden={screen !== 'stock'}>{native && snapshot ? <InventoryPanel canAdd={canAdd} canCorrect={canCorrect} refreshToken={inventoryRefresh} onSaved={refreshCheckout} disabled={busy} onLocked={onLocked} onDirtyChange={setCatalogDirty} onBusyChange={setCatalogBusy}/> : null}</div>
        <div hidden={screen !== 'customers'}>{native && snapshot ? <CustomerPanel role={session.principal.role} disabled={busy} refreshToken={customerRefresh} onChanged={refreshCheckout} onBusyChange={setCustomerBusy} onDirtyChange={setCustomerDirty}/> : null}</div>
        <div hidden={screen !== 'day'}>{native && snapshot ? <RetailPanel session={session} disabled={busy} refreshToken={retailRefresh} onChanged={retailChanged} onBusyChange={setRetailBusy} onDirtyChange={setRetailDirty}/> : null}</div>
        <div hidden={screen !== 'team'}>{native && snapshot && owner ? <StaffPanel disabled={busy || credentialDirty} refreshToken={staffRefresh} onBusyChange={setStaffBusy} onDirtyChange={setStaffDirty}/> : null}</div>
        <div hidden={screen !== 'settings'}>{native && snapshot ? <CredentialsPanel owner={owner} disabled={busy} blockedByDraft={otherDirty} onLocked={onLocked} onBusyChange={setCredentialBusy} onDirtyChange={setCredentialDirty} onStaffChanged={staffChanged}/> : null}</div>
        <div hidden={screen !== 'backup'}>{native && snapshot && owner ? <BackupPanel configured disabled={busy || staffDirty || catalogDirty || draftDirty || checkoutDirty || customerDirty || retailDirty || credentialDirty} onBusyChange={setBackupBusy} onDirtyChange={setBackupDirty} onRestored={onLocked} onLocked={onLocked}/> : null}</div>
        <div hidden={screen !== 'settings'}>{native && snapshot && owner ? <SavedCopies revision={snapshot.revision} disabled={busy} dirty={draftDirty} onLocked={onLocked} onRestore={(source) => void restore(source)}/> : null}</div>
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<AccessGate>{(onLocked, session) => <App onLocked={onLocked} session={session}/>}</AccessGate>);


