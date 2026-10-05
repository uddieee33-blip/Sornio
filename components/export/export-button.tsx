'use client';

/**
 * Export control.
 *
 * A small dropdown rather than a bare button, because the accountant usually
 * wants *one* thing — the ledger — and offering four options up front creates
 * a decision where there should be none. Keyboard accessible, closes on
 * outside click and Escape.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, Download, FileJson, FileSpreadsheet, Receipt, Users, Package, Wallet, Loader2 } from 'lucide-react';
import { EXPORT_LABELS, runExport, type ExportKind } from '@/lib/export/download';
import { useDukaanStore } from '@/lib/store';
import { useToast } from '@/lib/ui/toast';

const ICONS: Record<ExportKind, React.ReactNode> = {
  transactions: <FileSpreadsheet size={14} />,
  expenses: <Wallet size={14} />,
  customers: <Users size={14} />,
  products: <Package size={14} />,
  everything: <FileJson size={14} />,
};

const ORDER: ExportKind[] = ['transactions', 'expenses', 'customers', 'products', 'everything'];

export function ExportButton({ kinds = ORDER, label = 'Export' }: { kinds?: ExportKind[]; label?: string }) {
  const { state, hydrated } = useDukaanStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handle = (kind: ExportKind) => {
    setBusy(kind);
    // Yield one frame so the spinner paints before the synchronous build.
    requestAnimationFrame(() => {
      const result = runExport(state, kind);
      setBusy(null);
      setOpen(false);
      if (result.ok) {
        toast.success(
          'Export ready',
          result.rows > 0 ? `${result.rows} record${result.rows === 1 ? '' : 's'} written to ${result.filename}` : result.filename,
        );
      } else {
        toast.error('Export failed', result.error);
      }
    });
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((current) => !current)}
        disabled={!hydrated}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-stone-200 disabled:opacity-50"
      >
        <Download size={15} />
        {label}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-stone-200 bg-panel/97 p-1.5 shadow-float backdrop-blur-xl animate-fade-up"
        >
          <p className="flex items-center gap-1.5 px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-600">
            <Receipt size={11} /> Download your records
          </p>
          {kinds.map((kind) => (
            <button
              key={kind}
              role="menuitem"
              onClick={() => handle(kind)}
              disabled={busy !== null}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-stone-700 transition hover:bg-stone-100 hover:text-stone-900 disabled:opacity-50"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-stone-100 text-stone-600">
                {busy === kind ? <Loader2 size={13} className="animate-spin" /> : ICONS[kind]}
              </span>
              <span className="flex-1">{EXPORT_LABELS[kind]}</span>
              {busy === kind ? <Check size={13} className="text-emerald-700" /> : null}
            </button>
          ))}
          <p className="px-2.5 pb-1.5 pt-2 text-[10px] leading-relaxed text-stone-600">
            Built on this device. Nothing is uploaded anywhere.
          </p>
        </div>
      ) : null}
    </div>
  );
}
