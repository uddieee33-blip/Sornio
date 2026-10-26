import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, isTauri } from '@tauri-apps/api/core';
import './style.css';

type Draft = { businessName: string; businessType: string; note: string };
type Snapshot = { revision: number; draft: Draft | null };
const empty: Draft = { businessName: '', businessType: 'grocery', note: '' };
const types = [
  ['grocery', 'Grocery & kiryana'], ['retail', 'Retail store'], ['cafe', 'Café'],
  ['restaurant', 'Restaurant'], ['gym', 'Gym & fitness'], ['salon', 'Salon'],
  ['services', 'Services'], ['wholesale', 'Wholesale'],
];

function App() {
  const native = isTauri();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [status, setStatus] = useState<'opening' | 'ready' | 'saving' | 'error'>(native ? 'opening' : 'error');
  const [message, setMessage] = useState(native ? 'Opening your local workspace…' : 'Open the installed Windows app to use the local workspace.');
  const saving = useRef(false);
  const dirty = snapshot !== null && JSON.stringify(draft) !== JSON.stringify(snapshot.draft ?? empty);

  useEffect(() => {
    if (!native) return;
    let current = true;
    invoke<Snapshot>('load_workspace').then((saved) => {
      if (!current) return;
      setSnapshot(saved); setDraft(saved.draft ?? empty); setStatus('ready');
      setMessage(saved.draft ? 'Your saved draft is ready on this PC.' : 'Your local workspace is ready.');
    }).catch((error: unknown) => {
      if (current) { setStatus('error'); setMessage(typeof error === 'string' ? error : 'The local workspace could not be opened.'); }
    });
    return () => { current = false; };
  }, [native]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!native || !snapshot || saving.current) return;
    saving.current = true; setStatus('saving'); setMessage('Saving to this PC…');
    try {
      const saved = await invoke<Snapshot>('save_workspace', { expectedRevision: snapshot.revision, draft });
      setSnapshot(saved); setDraft(saved.draft ?? empty); setStatus('ready'); setMessage('Saved to this PC. You can close and reopen Sornio.');
    } catch (error: unknown) {
      setStatus('error'); setMessage(typeof error === 'string' ? error : 'The draft could not be saved. Keep this window open and try again.');
    } finally { saving.current = false; }
  }

  return <div className="desktop-shell">
    <aside className="rail">
      <a className="wordmark" href="#main" aria-label="Sornio workspace"><span className="brand-mark" aria-hidden="true">s</span>Sornio</a>
      <div className="workspace-name"><span className="eyebrow">THIS DEVICE</span><strong>Local workspace</strong><span>Windows foundation</span></div>
      <nav aria-label="Workspace"><a className="selected" href="#main"><span aria-hidden="true">◈</span> Workspace draft</a></nav>
      <div className="rail-bottom"><span className="status-dot"/> Built for your counter.<p>Local review · 0.1.0</p></div>
    </aside>
    <main id="main">
      <header className="topbar"><span>Workspace / Local review</span><span className="chip"><span className="status-dot"/> On this PC</span></header>
      <div className="page">
        <div className="heading"><div><p className="eyebrow">SORNIO FOR WINDOWS</p><h1>Your business.<br/><span>Right here.</span></h1><p className="intro">A dedicated workspace that opens from your PC.</p></div><span className="review-label">Storage foundation<br/>Use test data only</span></div>
        <section className="status-panel" aria-label="Local storage status"><span className="status-icon" aria-hidden="true">↳</span><div><strong>{status === 'opening' ? 'Opening local storage' : snapshot ? 'Your draft stays on this device' : 'Installed app required'}</strong><p role={status === 'error' ? 'alert' : 'status'} aria-live="polite">{message}</p></div><span className="revision">{snapshot ? `Revision ${snapshot.revision}` : 'Local only'}</span></section>
        <div className="workspace-grid">
          <form className="panel" onSubmit={(event) => void save(event)}>
            <div className="panel-heading"><div><p className="eyebrow">FIRST WORKSPACE</p><h2>Keep a local draft.</h2></div><span className="small-chip">{dirty ? 'Unsaved changes' : snapshot?.draft ? 'Saved' : 'New draft'}</span></div>
            <p className="muted">Save a sample business and note, then reopen the app without internet to check that it stays here.</p>
            <fieldset disabled={!snapshot || status === 'saving'}>
              <label htmlFor="business-name">Business name</label><input id="business-name" autoComplete="organization" value={draft.businessName} maxLength={120} required placeholder="Your sample business" onChange={(e) => setDraft({ ...draft, businessName: e.target.value })}/>
              <label htmlFor="business-type">Business type</label><select id="business-type" value={draft.businessType} onChange={(e) => setDraft({ ...draft, businessType: e.target.value })}>{types.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
              <label htmlFor="workspace-note">Workspace note</label><textarea id="workspace-note" rows={5} maxLength={2000} placeholder="A note to find when you reopen Sornio…" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })}/>
              <div className="form-footer"><p>{dirty ? 'Changes are not saved yet.' : 'Nothing leaves this PC in this build.'}</p><button type="submit" disabled={!dirty || !draft.businessName.trim()}>{status === 'saving' ? 'Saving…' : 'Save local draft'}<span aria-hidden="true">↗</span></button></div>
            </fieldset>
          </form>
          <aside className="side-panel"><p className="eyebrow">A STRONGER FOUNDATION</p><h2>A home on<br/>your desktop.</h2><p>The app screens are included in the Windows package. Opening this workspace does not load the public website.</p><div className="divider"/><h3>What this review includes</h3><ul><li>Local draft save and reopen</li><li>Encrypted device storage</li><li>No public browser workspace</li></ul><p className="footnote">Billing, account setup, device unlock, LAN sync and cloud backup are still being brought into this app. This review does not replace your current business records.</p></aside>
        </div>
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
