import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { errorMessage } from './access';
export type BackupPreview = {
  backupId: string; businessId: string; businessName: string; createdAt: number; schemaVersion: number;
  invoices: number; ledgerEntries: number; auditRecords: number; outboxEvents: number; pendingCheckout: boolean;
  fileSha256: string; currentFingerprint: string; confirmation: string;
};
export function BackupPanel({ configured, allowExport = true, disabled = false, onBusyChange, onDirtyChange, onRestored }: {
  configured: boolean; allowExport?: boolean; disabled?: boolean; onBusyChange?: (busy: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void; onRestored: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [currentPassword, setCurrent] = useState('');
  const [recoveryPassword, setRecovery] = useState('');
  const [originalPassword, setOriginal] = useState('');
  const [confirmRecovery, setConfirmRecovery] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [file, setFile] = useState('');
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const dirty = Boolean(currentPassword || recoveryPassword || originalPassword || confirmRecovery || confirmation);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    let current = true;
    invoke<{ backupId: string; createdAt: number } | null>('read_last_restore').then(receipt => {
      if (current && receipt) setMessage(previous => previous || `Last completed restore: ${receipt.backupId} at ${new Date(receipt.createdAt * 1000).toISOString()}. The pre-restore safety backup is in this PC’s recovery-safety folder.`);
    }).catch(() => { /* Locked/new workspaces expose no recovery history. */ });
    return () => { current = false; };
  }, []);
  const clear = () => { setCurrent(''); setRecovery(''); setOriginal(''); setConfirmRecovery(''); setConfirmation(''); };
  async function run(action: 'choose' | 'export' | 'preview' | 'restore') {
    if (submitting.current || disabled) return;
    if (action === 'export' && recoveryPassword !== confirmRecovery) { setFailed(true); setMessage('Recovery passphrases do not match.'); return; }
    submitting.current = true; setBusy(true); setFailed(false); setMessage('');
    try {
      const credentials = { currentPassword, recoveryPassword, originalPassword };
      if (action === 'choose') {
        setPreview(null); setFile('');
        setFile(await invoke<string | null>('choose_local_backup') ?? '');
      } else if (action === 'export') {
        const saved = await invoke<BackupPreview | null>('export_local_backup', credentials);
        if (saved) setMessage(`Encrypted backup saved and verified. Backup ID ${saved.backupId}. SHA-256 ${saved.fileSha256}. Keep the separate recovery passphrase safe.`);
        else setMessage('Backup export cancelled.');
      } else if (action === 'preview') {
        setPreview(null);
        setPreview(await invoke<BackupPreview>('preview_local_backup', credentials));
        setMessage('Backup verified. Re-enter the passwords before confirming restore.');
      } else {
        const safety = await invoke<string>('restore_local_backup', { ...credentials, confirmation });
        setPreview(null); setMessage(`Restore committed. Safety backup: ${safety}. Unlock with the original local password.`);
        onRestored();
      }
    } catch (error) {
      setFailed(true); setMessage(errorMessage(error, 'Recovery stopped. Keep the original files. Preview again before retrying.'));
      if (action === 'restore') setPreview(null);
    } finally { clear(); submitting.current = false; setBusy(false); }
  }
  return <section className="panel" aria-labelledby="backup-heading">
    <h2 id="backup-heading">Encrypted backup &amp; recovery</h2>
    <p>Save a verified backup to a USB drive or another folder. Only committed data is included. Unsaved screen edits and external files are excluded.</p>
    <p>Keep the recovery passphrase separate from the backup. Restoring needs that passphrase and the original local password. Forgotten credentials cannot be bypassed. A lost PC can be recovered on a new, unconfigured Windows workspace using both credentials.</p>
    <button type="button" className="quiet-button" disabled={busy || disabled} onClick={() => { clear(); setOpen(v => !v); }}>{open ? 'Close backup controls' : 'Open backup controls'}</button>
    {open ? <fieldset disabled={disabled || busy}>
      {configured ? <><label htmlFor="backup-current">Current local password</label><input id="backup-current" type="password" autoComplete="current-password" maxLength={128} value={currentPassword} onChange={e => setCurrent(e.target.value)}/></> : null}
      <label htmlFor="backup-recovery">Recovery passphrase</label><input id="backup-recovery" type="password" autoComplete="off" minLength={14} maxLength={128} value={recoveryPassword} onChange={e => setRecovery(e.target.value)}/>
      {configured && allowExport ? <><label htmlFor="backup-confirm">Confirm recovery passphrase for export</label><input id="backup-confirm" type="password" autoComplete="off" maxLength={128} value={confirmRecovery} onChange={e => setConfirmRecovery(e.target.value)}/><p>Use a separate passphrase of 14–128 characters. Choose a new filename; existing backups are never overwritten.</p><button type="button" disabled={!currentPassword || Array.from(recoveryPassword).length < 14 || !confirmRecovery} onClick={() => void run('export')}>Export encrypted backup…</button></> : null}
      <p><button type="button" className="quiet-button" onClick={() => void run('choose')}>Choose encrypted backup…</button> <span>{file}</span></p>
      <label htmlFor="backup-original">Original local password from backup</label><input id="backup-original" type="password" autoComplete="off" maxLength={128} value={originalPassword} onChange={e => setOriginal(e.target.value)}/>
      <button type="button" disabled={!file || !recoveryPassword || !originalPassword || (configured && !currentPassword)} onClick={() => void run('preview')}>Verify and preview backup</button>
      {preview ? <div role="group" aria-label="Verified backup preview">
        <h3>{preview.businessName}</h3>
        <p>Business ID: {preview.businessId}</p><p>Backup ID: {preview.backupId}</p>
        <p>Saved {new Date(preview.createdAt * 1000).toISOString()} · Schema {preview.schemaVersion}</p>
        <p>Invoices: {preview.invoices} · Ledger entries: {preview.ledgerEntries} · Audit records: {preview.auditRecords} · Outbox events: {preview.outboxEvents}</p>
        <p>{preview.pendingCheckout ? 'A saved checkout is included and will need review after recovery.' : 'No saved checkout at snapshot time.'}</p>
        <p>SHA-256: {preview.fileSha256}</p>
        <p>Restore replaces this workspace with the saved point in time. Later sales disappear from the active workspace and remain only in the mandatory encrypted safety backup. This is not a merge. Do not resume selling on both restored and original PCs.</p>
        <label htmlFor="backup-phrase">Type {preview.confirmation} to restore</label><input id="backup-phrase" autoComplete="off" value={confirmation} onChange={e => setConfirmation(e.target.value)}/>
        <button type="button" disabled={confirmation !== preview.confirmation || !recoveryPassword || !originalPassword || (configured && !currentPassword)} onClick={() => void run('restore')}>Create safety backup and restore</button>
      </div> : null}
    </fieldset> : null}
    {message ? <p role={failed ? 'alert' : 'status'} aria-live="polite">{message}</p> : null}
    {busy ? <p role="status">Working with the encrypted backup. Keep this window open…</p> : null}
  </section>;
}
