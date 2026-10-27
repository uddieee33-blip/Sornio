import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { PortalId } from '../../../packages/business-domain/src/business-types';
import { dailyWorkspace } from '../../../packages/business-domain/src/daily-workspace';
import { SavedCopies } from './SavedCopies';
import { InventoryPanel } from './InventoryPanel';
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

function App({ onLocked }: { onLocked: () => void }) {
  const native = isTauri();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [status, setStatus] = useState<'opening' | 'ready' | 'saving' | 'error'>(native ? 'opening' : 'error');
  const [message, setMessage] = useState(native ? 'Opening your local workspace…' : 'Open the installed Windows app to use the local workspace.');
  const saving = useRef(false);
  const [reopenPrompt, setReopenPrompt] = useState(false);
  const [lockPrompt, setLockPrompt] = useState(false);
  const [catalogDirty, setCatalogDirty] = useState(false);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [checkoutDirty, setCheckoutDirty] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [inventoryRefresh, setInventoryRefresh] = useState(0);
  const [checkoutRefresh, setCheckoutRefresh] = useState(0);
  const refreshInventory = useCallback(() => setInventoryRefresh(value => value + 1), []);
  const refreshCheckout = useCallback(() => setCheckoutRefresh(value => value + 1), []);
  const draftDirty = snapshot !== null && JSON.stringify(draft) !== JSON.stringify(snapshot.draft ?? empty);
  const dirty = catalogDirty || draftDirty || checkoutDirty;

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

  const busy = checkoutBusy || catalogBusy || status === 'opening' || status === 'saving';

  async function lock(discard = false) {
    if (!native || saving.current || busy) return;
    if (dirty && !discard) { setLockPrompt(true); return; }
    saving.current = true; setStatus('saving'); setMessage('Locking this workspace…');
    try { await invoke('lock_workspace'); onLocked(); }
    catch (error: unknown) { setStatus('error'); setMessage(errorMessage(error, 'The workspace could not be locked. Keep this window open and retry.')); }
    finally { saving.current = false; }
  }

  return <div className="desktop-shell">
    <aside className="rail">
      <a className="wordmark" href="#main" aria-label="Sornio workspace"><img className="brand-mark" src={brandIcon} alt="" width={38} height={38}/>Sornio</a>
      <div className="workspace-name"><span className="eyebrow">THIS DEVICE</span><strong>Local workspace</strong><span>Windows foundation</span></div>
      <nav aria-label="Workspace"><a className="selected" href="#main"><span aria-hidden="true">◈</span> Workspace draft</a><a href="#checkout">Checkout</a><a href="#inventory-heading">Items &amp; stock</a></nav>
      <div className="rail-bottom"><span className="status-dot"/> Built for your counter.<p>Local review · 0.3.0</p></div>
    </aside>
    <main id="main">
      <header className="topbar"><span>Workspace / Local review</span><div className="topbar-actions"><span className="chip"><span className="status-dot"/> On this PC</span><button type="button" className="quiet-button" disabled={busy} onClick={() => void lock()}>Lock workspace</button></div></header>
      <div className="page">
        <div className="heading"><div><p className="eyebrow">SORNIO FOR WINDOWS</p><h1>Your business.<br/><span>Right here.</span></h1><p className="intro">A dedicated workspace that opens from your PC.</p></div><span className="review-label">Storage foundation<br/>Use test data only</span></div>
        <section className="status-panel" aria-label="Local storage status"><span className="status-icon" aria-hidden="true">↳</span><div><strong>{status === 'opening' ? 'Opening local storage' : snapshot ? 'Your draft stays on this device' : native ? 'Local storage needs attention' : 'Installed app required'}</strong><p role={status === 'error' ? 'alert' : 'status'} aria-live="polite">{message}</p></div><span className="revision">{snapshot ? `Revision ${snapshot.revision}` : 'Local only'}</span></section>
        {lockPrompt ? <section className="panel lock-prompt" role="group" aria-label="Lock unsaved workspace"><p>Locking will discard your unsaved edits. Save them first, or discard them to lock.</p><button className="quiet-button" type="button" disabled={busy} onClick={() => setLockPrompt(false)}>Continue editing</button><button type="button" disabled={busy} onClick={() => void lock(true)}>Discard edits and lock</button></section> : null}
        {native && snapshot ? <CheckoutPanel disabled={busy} refreshToken={checkoutRefresh} onLocked={onLocked} onDirtyChange={setCheckoutDirty} onBusyChange={setCheckoutBusy} onPosted={refreshInventory}/> : null}
        <div className="workspace-grid">
          <form className="panel" onSubmit={(event) => void save(event)}>
            <div className="panel-heading"><div><p className="eyebrow">FIRST WORKSPACE</p><h2>Keep a local draft.</h2></div><span className="small-chip">{draftDirty ? 'Unsaved changes' : snapshot?.draft ? 'Saved' : 'New draft'}</span></div>
            <p className="muted">Save a sample business and note, then reopen the app without internet to check that it stays here.</p>
            <fieldset disabled={!snapshot || busy}>
              <label htmlFor="business-name">Business name</label><input id="business-name" autoComplete="organization" value={draft.businessName} maxLength={120} required placeholder="Your sample business" onChange={(e) => setDraft({ ...draft, businessName: e.target.value })}/>
              <label htmlFor="business-type">Business type</label><select aria-describedby="business-description" id="business-type" value={draft.businessType} onChange={(e) => setDraft({ ...draft, businessType: e.target.value as PortalId })}>{types.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
              <p id="business-description">{dailyWorkspace(draft.businessType).description}</p>
              <label htmlFor="workspace-note">Workspace note</label><textarea id="workspace-note" rows={5} maxLength={2000} placeholder="A note to find when you reopen Sornio…" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })}/>
              <div className="form-footer"><p>{draftDirty ? 'Changes are not saved yet.' : 'Nothing leaves this PC in this build.'}</p><button type="submit" disabled={!draftDirty || !draft.businessName.trim()}>{status === 'saving' ? 'Saving…' : 'Save local draft'}<span aria-hidden="true">↗</span></button></div>
            </fieldset>
            {native ? <div className="reopen-actions">
              {reopenPrompt ? <div className="reopen-prompt" role="group" aria-label="Reopen saved draft">
                <p>Your unsaved edits will be replaced by the latest saved draft.</p>
                <button type="button" className="quiet-button" disabled={busy} onClick={() => setReopenPrompt(false)}>Keep editing</button>
                <button type="button" disabled={busy} onClick={() => void reopen()}>Discard edits and reopen</button>
              </div> : <button className="quiet-button" type="button" disabled={busy} onClick={() => { if (draftDirty) setReopenPrompt(true); else void reopen(); }}>Reopen saved draft</button>}
            </div> : null}
          </form>
          <aside className="side-panel"><p className="eyebrow">A STRONGER FOUNDATION</p><h2>A home on<br/>your desktop.</h2><p>The app screens are included in the Windows package. Opening this workspace does not load the public website.</p><div className="divider"/><h3>What this review includes</h3><ul><li>Local draft save and reopen</li><li>Encrypted device storage</li><li>Password lock and unlock</li><li>Local item and stock entry</li><li>Cash and credit checkout</li></ul><p className="footnote">Verified account setup, staff roles, LAN sync and cloud backup are still being brought into this app. This review does not replace your current business records.</p></aside>
        </div>
        {native && snapshot ? <InventoryPanel refreshToken={inventoryRefresh} onSaved={refreshCheckout} disabled={busy} onLocked={onLocked} onDirtyChange={setCatalogDirty} onBusyChange={setCatalogBusy}/> : null}
        {native && snapshot ? <SavedCopies revision={snapshot.revision} disabled={busy} dirty={draftDirty} onLocked={onLocked} onRestore={(source) => void restore(source)}/> : null}
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<AccessGate>{(onLocked) => <App onLocked={onLocked}/>}</AccessGate>);

