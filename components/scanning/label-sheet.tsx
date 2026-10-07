'use client';

import { useLocaleRefresh } from '@/lib/i18n';

/**
 * A sheet of labels, ready for the shop's printer.
 *
 * This is what closes the loop that most "we support barcodes" features leave
 * open: the shop sells loose grain and stitched stock that will never carry a
 * manufacturer's code, so DukaanOS prints its own — a real EAN-13 or a Code 128,
 * generated in the browser from the verified encoders in `lib/scanning/encoder`.
 *
 * Printing is handled honestly for a browser: the sheet carries the console's
 * existing `print-area` class, so the print stylesheet in `app/globals.css`
 * hides the console and prints the labels themselves — paper labels, not a
 * screenshot of a dashboard. A thermal label printer works through the same
 * dialog, no driver or vendor app involved.
 */

import { Printer } from 'lucide-react';
import { BarcodeSvg } from './barcode-svg';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/business-data';

export type LabelSpec = {
  id: string;
  /** What the sheet is for, e.g. the item name. */
  name: string;
  /** The code being printed (a GTIN or a DukaanOS internal code). */
  code: string;
  /** Price line; a rate with a unit reads best on a shelf tag. */
  price?: number;
  unit?: string;
  /** For a weigh label: the exact weight this label carries. */
  weight?: string;
  /** Printed small under the name — “1 kg pack”, “Size M / Indigo”. */
  detail?: string;
  shopName: string;
  kind: 'shelf' | 'product' | 'loose';
};

function LabelCard({ label }: { label: LabelSpec }) {
  return (
    <div className="dukaan-label flex break-inside-avoid flex-col items-center rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-center">
      <p className="w-full truncate text-[9px] font-bold uppercase tracking-[0.16em] text-stone-500">{label.shopName}</p>
      <p className="mt-0.5 w-full truncate text-[12px] font-bold text-stone-900">{label.name}</p>
      {label.detail ? <p className="w-full truncate text-[9px] text-stone-500">{label.detail}</p> : null}
      {label.price !== undefined ? (
        <p className="mt-0.5 font-display text-[15px] font-bold text-stone-900">
          {formatCurrency(label.price)}
          {label.unit ? <span className="text-[10px] font-semibold text-stone-500"> / {label.unit}</span> : null}
        </p>
      ) : null}
      {label.weight ? <p className="text-[10px] font-bold text-stone-700">{label.weight}</p> : null}
      <div className="mt-1.5">
        <BarcodeSvg value={label.code} height={40} className="max-w-[210px]" />
      </div>
      <p className="mt-0.5 font-mono text-[9px] tracking-[0.14em] text-stone-600">{label.code}</p>
      {label.kind === 'loose' ? (
        <p className="text-[8px] font-semibold uppercase tracking-wide text-stone-400">in-store label</p>
      ) : null}
    </div>
  );
}

export function LabelSheet({
  labels,
  columns = 3,
  emptyNote = 'Nothing selected yet — pick the items you want labels for.',
}: {
  labels: LabelSpec[];
  columns?: 2 | 3 | 4;
  emptyNote?: string;
}) {
  useLocaleRefresh();
  const gridClass = columns === 4 ? 'sm:grid-cols-4' : columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3';

  return (
    <div className="dukaan-label-sheet">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 no-print">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
          {labels.length} label{labels.length === 1 ? '' : 's'} on this sheet
        </p>
        <Button variant="secondary" onClick={() => window.print()} disabled={labels.length === 0}>
          <Printer size={15} /> Print labels
        </Button>
      </div>
      {labels.length === 0 ? (
        <p className="rounded-xl bg-stone-50 p-4 text-xs leading-relaxed text-stone-600 ring-1 ring-inset ring-stone-200">{emptyNote}</p>
      ) : (
        <div className={`print-area grid grid-cols-2 gap-2.5 ${gridClass}`}>
          {labels.map((label) => (
            <LabelCard key={label.id} label={label} />
          ))}
        </div>
      )}
    </div>
  );
}
