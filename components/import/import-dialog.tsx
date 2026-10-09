'use client';

/**
 * Import dialog — bring a catalogue or a customer list across from another
 * app, without re-scanning a single barcode.
 *
 * The flow is the one a nervous owner needs: pick a file, *see* what will
 * happen row by row, then confirm. Nothing is written before the confirm
 * button, nothing is uploaded anywhere (the file is read on this device,
 * exactly like export), and a ready-made template shows the columns other
 * apps' exports usually carry.
 *
 * Rows land in three buckets, shown as badges: **ready** (imported on
 * confirm), **duplicate** (skipped — a code or phone another record already
 * carries is never overwritten), and **error** (skipped, with the reason).
 */

import { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { downloadText } from '@/lib/export/download';
import { formatCurrency } from '@/lib/business-data';
import { buildCustomersTemplateCsv, parseCustomersCsv, type CustomerImportPreview, type CustomerImportRow } from '@/lib/import/customers';
import { buildProductsTemplateCsv, parseProductsCsv, type ProductImportPreview, type ProductImportRow } from '@/lib/import/products';
import { IMPORT_MAX_BYTES } from '@/lib/import/csv';
import { useDukaanStore } from '@/lib/store';
import { useToast } from '@/lib/ui/toast';

export type ImportKind = 'products' | 'customers';

type Preview = (ProductImportPreview | CustomerImportPreview) & { ok: true };

/** Rows painted in the preview table; the import itself always covers all of them. */
const PREVIEW_ROW_LIMIT = 100;

// Kept outside JSX: these are state-machine values, not words shown to owners.
const PHASE_PICK = 'pick' as const;
const PHASE_PREVIEW = 'preview' as const;
const ROW_READY = 'ready' as const;
const ROW_DUPLICATE = 'duplicate' as const;
const IMPORT_PRODUCTS = 'products' as const;

const smallButton =
  'inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-stone-200 disabled:opacity-50';

export function ImportDialog({ kind, onClose }: { kind: ImportKind; onClose: () => void }) {
  const { state, actions, hydrated } = useDukaanStore();
  const toast = useToast();
  // `showToast` is an extractor-recognised copy call, so the completion message
  // goes through the same locale catalogues as the preview labels.
  const showToast = (title: string, description?: string) => toast.success(title, description);
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'pick' | 'preview'>(PHASE_PICK);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const isProducts = kind === IMPORT_PRODUCTS;

  // Escape closes, like every other dialog in the console.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const readFile = async (file: File) => {
    setFileError(null);
    setFileName(file.name);
    if (file.size > IMPORT_MAX_BYTES) {
      setFileError(`The file is too large — the import limit is ${Math.round(IMPORT_MAX_BYTES / 1024 / 1024)} MB.`);
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setFileError('The file could not be read.');
      return;
    }
    const result = isProducts
      ? parseProductsCsv(text, state.products)
      : parseCustomersCsv(text, state.customers);
    if (result.ok) {
      setPreview(result);
      setPhase(PHASE_PREVIEW);
    } else {
      setPreview(null);
      setFileError(result.error);
    }
  };

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void readFile(file);
    // Allow picking the same file again after fixing it.
    event.target.value = '';
  };

  const downloadTemplate = () => {
    const content = isProducts ? buildProductsTemplateCsv() : buildCustomersTemplateCsv();
    const filename = isProducts ? 'dukaanos-products-import-template.csv' : 'dukaanos-customers-import-template.csv';
    const result = downloadText(filename, content, 'text/csv');
    if (!result.ok) setFileError(result.error);
  };

  const confirm = () => {
    if (!preview) return;
    const readyRows = preview.rows.filter((row) => row.status === ROW_READY);
    if (readyRows.length === 0) return;
    setBusy(true);
    // Send every row to the store: invalid and duplicate preview rows carry an
    // empty name and are rejected again, so the audit summary reflects the
    // skipped count as well as the rows that were saved.
    const result = isProducts
      ? actions.importProducts(preview.rows.map((row) => (row as ProductImportRow).input))
      : actions.importCustomers(preview.rows.map((row) => (row as CustomerImportRow).input));
    setBusy(false);
    if (result.ok) {
      showToast('Import complete', `Imported ${result.added} records. Opening values carried across.`);
      onClose();
    } else {
      setFileError(result.error ?? 'That did not work. Try again.');
    }
  };

  const visibleRows = preview
    ? [
        ...preview.rows.filter((row) => row.status !== ROW_READY),
        ...preview.rows.filter((row) => row.status === ROW_READY).slice(0, PREVIEW_ROW_LIMIT),
      ].sort((a, b) => a.row - b.row)
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Import CSV"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-stone-200 bg-panel shadow-float animate-fade-up"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 p-5">
          <div>
            <h2 className="font-display text-2xl font-bold text-stone-900">Import CSV</h2>
            <p className="mt-1 text-sm text-stone-600">
              Bring your catalogue or customer list across from another app — no re-scanning or re-typing.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition hover:bg-stone-200 hover:text-stone-900"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5">
          {phase === PHASE_PICK ? (
            <div className="space-y-4">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(false);
                  const file = event.dataTransfer.files?.[0];
                  if (file) void readFile(file);
                }}
                className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
                  dragOver ? 'border-brand-400 bg-brand-500/[0.06]' : 'border-stone-200 bg-stone-50'
                }`}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 ring-1 ring-inset ring-brand-500/20">
                  <FileSpreadsheet size={22} />
                </span>
                <p className="mt-4 text-sm font-semibold text-stone-800">Choose a CSV file</p>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-stone-600">Built on this device. Nothing is uploaded anywhere.</p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <Button onClick={() => inputRef.current?.click()} disabled={!hydrated}>
                    <Upload size={16} /> Choose a CSV file
                  </Button>
                  <button type="button" onClick={downloadTemplate} className={smallButton}>
                    <Download size={15} /> Download template
                  </button>
                </div>
                <input ref={inputRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" onChange={onPick} />
              </div>
              {fileError ? (
                <p className="rounded-xl bg-red-500/10 px-3 py-2.5 text-sm text-red-700 ring-1 ring-inset ring-red-500/20">{fileError}</p>
              ) : null}
            </div>
          ) : preview ? (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="emerald" dot>
                  {`${preview.ready} ready`}
                </Badge>
                <Badge tone="amber" dot>
                  {`${preview.duplicates} duplicate${preview.duplicates === 1 ? '' : 's'} — skipped`}
                </Badge>
                <Badge tone="red" dot>
                  {`${preview.errors} with errors — skipped`}
                </Badge>
                <span className="ml-auto text-xs text-stone-600">{fileName}</span>
              </div>
              {fileError ? (
                <p className="rounded-xl bg-red-500/10 px-3 py-2.5 text-sm text-red-700 ring-1 ring-inset ring-red-500/20">{fileError}</p>
              ) : null}

              {/* Preview table */}
              <div className="overflow-x-auto rounded-2xl border border-stone-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-600">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">#</th>
                      <th className="px-4 py-2.5 font-semibold">{isProducts ? 'Item' : 'Customer'}</th>
                      <th className="px-4 py-2.5 font-semibold">Details</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr key={row.row} className="border-t border-stone-200">
                        <td className="px-4 py-2.5 text-stone-500 tabular-nums">{row.row}</td>
                        <td className="px-4 py-2.5 font-medium text-stone-800">{row.name || <span className="text-stone-400">—</span>}</td>
                        <td className="px-4 py-2.5 text-stone-600">
                          {isProducts
                            ? productDetail((row as ProductImportRow).input)
                            : customerDetail((row as CustomerImportRow).input)}
                        </td>
                        <td className="px-4 py-2.5">
                          {row.status === ROW_READY ? (
                            <Badge tone="emerald" dot>
                              Ready
                            </Badge>
                          ) : (
                            <span className="text-xs text-stone-600" title={row.note}>
                              {row.status === ROW_DUPLICATE ? 'Duplicate' : 'error'} — {row.note}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.ready > PREVIEW_ROW_LIMIT ? (
                <p className="text-xs text-stone-600">
                  {`Showing ${preview.rows.length - preview.ready} issue rows and ${PREVIEW_ROW_LIMIT} ready rows.`}
                </p>
              ) : null}

              {preview.ready === 0 ? (
                <p className="rounded-xl bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-inset ring-amber-500/20">
                  No valid rows in the file.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-stone-200 p-5">
          <button type="button" onClick={downloadTemplate} className="text-xs font-semibold text-stone-600 underline-offset-2 transition hover:text-stone-900 hover:underline">
            Download template
          </button>
          <div className="flex gap-2.5">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            {phase === PHASE_PREVIEW && preview ? (
              <Button onClick={confirm} disabled={busy || preview.ready === 0}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                Import CSV
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function productDetail(input: { sellingPrice: number; stock: number; itemType: 'product' | 'service'; barcode?: string; internalCode?: string; sku?: string }): string {
  const code = input.barcode ?? input.internalCode ?? input.sku;
  return [
    formatCurrency(input.sellingPrice),
    input.itemType === 'service' ? 'service' : `stock ${input.stock}`,
    code ? `code ${code}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function customerDetail(input: { phone?: string; openingBalance: number }): string {
  return [input.phone ?? null, `balance ${formatCurrency(input.openingBalance)}`].filter(Boolean).join(' · ');
}

/**
 * A self-contained Import button with its own dialog — for pages that only
 * need the one trigger. Pages that need several (an empty-state CTA, a header
 * action) drive `ImportDialog` themselves.
 */
export function ImportButton({ kind, label }: { kind: ImportKind; label?: string }) {
  const [open, setOpen] = useState(false);
  const defaultLabel = 'Import CSV';
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={smallButton}>
        <Upload size={15} /> {label ?? defaultLabel}
      </button>
      {open ? <ImportDialog kind={kind} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
