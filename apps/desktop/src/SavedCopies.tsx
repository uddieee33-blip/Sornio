import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { SavedCopy } from './workspace-types';

export function SavedCopies({ revision, disabled, dirty, onRestore }: {
  revision: number;
  disabled: boolean;
  dirty: boolean;
  onRestore: (source: number) => void;
}) {
  const [result, setResult] = useState<{
    revision: number; refresh: number; copies: SavedCopy[]; error: string;
  } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const loading = result?.revision !== revision || result.refresh !== refresh;
  const copies = loading ? [] : result.copies;
  const error = loading ? '' : result.error;

  useEffect(() => {
    let current = true;
    invoke<SavedCopy[]>('list_workspace_copies').then((saved) => {
      if (current) setResult({ revision, refresh, copies: saved, error: '' });
    }).catch(() => {
      if (current) setResult({ revision, refresh, copies: [], error: 'Saved copies could not be opened. Your current draft is still here.' });
    });
    return () => { current = false; };
  }, [revision, refresh]);

  return <section className="panel recovery-panel" aria-labelledby="saved-copies-title" aria-busy={loading}>
    <div className="panel-heading"><div><p className="eyebrow">ON THIS PC</p><h2 id="saved-copies-title">Saved copies</h2></div>
      <button className="quiet-button" type="button" disabled={disabled || loading} onClick={() => setRefresh((n) => n + 1)}>Refresh copies</button>
    </div>
    <p className="muted">Your latest 20 saved drafts stay in encrypted storage. Restoring a copy creates a new revision.</p>
    <p className="history-notice">{dirty ? 'Save your changes or reopen the saved draft before restoring a copy.' : 'These copies are on this PC. They cannot recover a lost device or a damaged database.'}</p>
    {error ? <p role="alert">{error}</p> : loading ? <p role="status">Opening saved copies…</p> : copies.length === 0 ? <p>No saved copies yet. Save your first draft to begin.</p> : <ol className="saved-copies">
      {copies.map((copy) => <li key={copy.revision}>
        <div><strong>{copy.draft.businessName}</strong><p className="copy-note">{copy.draft.note || 'No workspace note'}</p><span className="muted">Revision {copy.revision}{copy.revision === revision ? ' · Current draft' : ''}</span></div>
        <button type="button" className="quiet-button" disabled={disabled || dirty || copy.revision === revision} aria-label={`Restore saved copy ${copy.revision}`} onClick={() => onRestore(copy.revision)}>Restore copy</button>
      </li>)}
    </ol>}
  </section>;
}
