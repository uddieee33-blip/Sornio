import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { invoke } from './native';
import { errorCode, errorMessage } from './access';
import type { ReceiptLayout } from './receipt-print';
import type {
  BarcodeSuffixMode,
  CashDrawerMode,
  LocalPrinterInfo,
  SaveWorkstationSettings,
  WorkstationSettings,
} from './workstation-types';

type DraftFields = {
  receiptLayout: ReceiptLayout;
  receiptLanguage: 'en' | 'pa';
  printerName: string;
  barcodeSuffix: BarcodeSuffixMode;
  cashDrawerMode: CashDrawerMode;
  backupDestinationNote: string;
};

export function WorkstationSettingsPanel({
  owner,
  disabled,
  settings,
  printers,
  onSaved,
  onPrintersChanged,
  onLocked,
  onBusyChange,
  onDirtyChange,
}: {
  owner: boolean;
  disabled: boolean;
  settings: WorkstationSettings;
  printers: readonly LocalPrinterInfo[];
  onSaved: (next: WorkstationSettings) => void;
  onPrintersChanged: (next: LocalPrinterInfo[]) => void;
  onLocked: () => void;
  onBusyChange: (busy: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<{ baseRevision: number; fields: DraftFields } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('Workstation printer, scanner, and backup preferences stay on this PC.');

  const current: DraftFields =
    draft && draft.baseRevision === settings.revision
      ? draft.fields
      : {
          receiptLayout: settings.receiptLayout,
          receiptLanguage: settings.receiptLanguage,
          printerName: settings.printerName,
          barcodeSuffix: settings.barcodeSuffix,
          cashDrawerMode: settings.cashDrawerMode,
          backupDestinationNote: settings.backupDestinationNote,
        };

  function updateField<K extends keyof DraftFields>(key: K, value: DraftFields[K]) {
    setDraft({ baseRevision: settings.revision, fields: { ...current, [key]: value } });
  }

  const dirty =
    current.receiptLayout !== settings.receiptLayout ||
    current.receiptLanguage !== settings.receiptLanguage ||
    current.printerName !== settings.printerName ||
    current.barcodeSuffix !== settings.barcodeSuffix ||
    current.cashDrawerMode !== settings.cashDrawerMode ||
    current.backupDestinationNote !== settings.backupDestinationNote;

  useEffect(() => {
    onDirtyChange(owner && dirty);
  }, [owner, dirty, onDirtyChange]);

  async function refreshPrinters() {
    if (busy || disabled) return;
    setBusy(true);
    onBusyChange(true);
    try {
      const list = await invoke<LocalPrinterInfo[]>('list_local_printers');
      onPrintersChanged(list);
      setFailed(false);
      setMessage(
        list.length
          ? `Found ${list.length} installed local printer${list.length === 1 ? '' : 's'} on this PC.`
          : 'No Windows printers were reported. You can still print to PDF or enter a printer name manually.',
      );
    } catch (error: unknown) {
      if (errorCode(error) === 'locked') { onLocked(); return; }
      setFailed(true);
      setMessage(errorMessage(error, 'Local printers could not be listed. Offline billing is unaffected.'));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!owner || busy || disabled || !dirty) return;
    setBusy(true);
    onBusyChange(true);
    setFailed(false);
    setMessage('Saving workstation preferences to this PC…');
    try {
      const payload: SaveWorkstationSettings = {
        expectedRevision: settings.revision,
        receiptLayout: current.receiptLayout,
        receiptLanguage: current.receiptLanguage,
        printerName: current.printerName.trim(),
        barcodeSuffix: current.barcodeSuffix,
        cashDrawerMode: current.cashDrawerMode,
        backupDestinationNote: current.backupDestinationNote.trim(),
      };
      const saved = await invoke<WorkstationSettings>('save_workstation_settings', { r: payload });
      setDraft(null);
      onSaved(saved);
      setFailed(false);
      setMessage('Workstation preferences saved on this PC.');
    } catch (error: unknown) {
      if (errorCode(error) === 'locked') { onLocked(); return; }
      setFailed(true);
      setMessage(errorMessage(error, 'Workstation preferences could not be saved.'));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <details className="panel workstation-details">
      <summary>
        <strong>Counter hardware &amp; receipt defaults</strong> — {settings.receiptLayout} ·{' '}
        {settings.receiptLanguage === 'pa' ? 'ਪੰਜਾਬੀ' : 'English'} ·{' '}
        {settings.printerName || 'Windows default printer'}
      </summary>
      <p className="muted">
        Configure receipt paper width, default receipt language, Windows printer label, USB HID barcode scanner suffix,
        cash-drawer contract mode, and your offline backup USB/folder reminder.
      </p>
      <p role={failed ? 'alert' : 'status'} aria-live="polite">{message}</p>
      <form onSubmit={e => void save(e)}>
        <fieldset disabled={!owner || busy || disabled}>
          <label htmlFor="ws-receipt-layout">Default receipt paper width</label>
          <select
            id="ws-receipt-layout"
            value={current.receiptLayout}
            onChange={e => updateField('receiptLayout', e.target.value as ReceiptLayout)}
          >
            <option value="80mm">80 mm thermal roll</option>
            <option value="58mm">58 mm thermal roll</option>
            <option value="a4">A4 desktop printer</option>
          </select>

          <label htmlFor="ws-receipt-language">Default receipt language</label>
          <select
            id="ws-receipt-language"
            value={current.receiptLanguage}
            onChange={e => updateField('receiptLanguage', e.target.value as 'en' | 'pa')}
          >
            <option value="en">English</option>
            <option value="pa">ਪੰਜਾਬੀ (Punjabi)</option>
          </select>

          <label htmlFor="ws-printer-select">Detected Windows printers</label>
          <div className="allocation-entry">
            <select
              id="ws-printer-select"
              value={printers.some(p => p.name === current.printerName) ? current.printerName : ''}
              onChange={e => updateField('printerName', e.target.value)}
            >
              <option value="">Use Windows default / manual entry</option>
              {printers.map(p => (
                <option key={p.name} value={p.name}>
                  {p.name}
                  {p.isDefault ? ' (Default)' : ''}
                  {p.workOffline || p.status === 'offline' || p.status === 'stopped' ? ` — ${p.status}` : ''}
                </option>
              ))}
            </select>
            <button type="button" className="quiet-button" disabled={busy || disabled} onClick={() => void refreshPrinters()}>
              Refresh printers
            </button>
          </div>

          <label htmlFor="ws-printer-name">Preferred receipt printer name</label>
          <input
            id="ws-printer-name"
            maxLength={120}
            placeholder="e.g. TVS RP-3200 Thermal or Microsoft Print to PDF"
            value={current.printerName}
            onChange={e => updateField('printerName', e.target.value)}
          />

          <label htmlFor="ws-barcode-suffix">USB barcode scanner suffix key</label>
          <select
            id="ws-barcode-suffix"
            value={current.barcodeSuffix}
            onChange={e => updateField('barcodeSuffix', e.target.value as BarcodeSuffixMode)}
          >
            <option value="enter_or_tab">Enter or Tab (recommended)</option>
            <option value="enter">Enter only</option>
            <option value="tab">Tab only</option>
          </select>

          <label htmlFor="ws-cash-drawer">Cash drawer connection mode</label>
          <select
            id="ws-cash-drawer"
            value={current.cashDrawerMode}
            onChange={e => updateField('cashDrawerMode', e.target.value as CashDrawerMode)}
          >
            <option value="none">No cash drawer</option>
            <option value="manual_only">Manual key-opened drawer</option>
            <option value="escpos_pin2">RJ11 via ESC/POS printer (Pin 2 pulse contract)</option>
            <option value="escpos_pin5">RJ11 via ESC/POS printer (Pin 5 pulse contract)</option>
          </select>
          <p className="muted">
            ESC/POS drawer kickout uses standard pulse bytes (ESC p) through a thermal printer driver configured in Windows.
            Physical drawer trigger must be verified on the shop&apos;s own printer and drawer before go-live.
          </p>

          <label htmlFor="ws-backup-note">Offline backup destination reminder</label>
          <input
            id="ws-backup-note"
            maxLength={160}
            placeholder="e.g. Daily encrypted backup to Shop USB E:\\SornioBackups"
            value={current.backupDestinationNote}
            onChange={e => updateField('backupDestinationNote', e.target.value)}
          />

          {owner ? (
            <div className="form-footer">
              <p>{dirty ? 'Unsaved workstation settings.' : `Saved (revision ${settings.revision}).`}</p>
              <button type="submit" disabled={!dirty || busy || disabled}>
                {busy ? 'Saving…' : 'Save workstation settings'}
              </button>
            </div>
          ) : (
            <p className="muted">Only the shop owner can change workstation hardware settings.</p>
          )}
        </fieldset>
      </form>
    </details>
  );
}
