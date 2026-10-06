'use client';

/**
 * Inventory — /inventory.
 *
 * The page exists to answer one question a shopkeeper asks out loud: *"the
 * shelf had 108 packets and three went out — does the computer say 105?"* The
 * on-hand figure is only half of that answer; the other half is the **movement
 * history** behind it, which is why every item here can be opened up to show
 * exactly what moved, when, why, and what the balance was after each step.
 *
 * Three things this screen refuses to do:
 *   • It never shows a stock number without a way to check it. Every item's
 *     ledger is one tap away, and the balances are computed by the same pure
 *     module the counter writes through (`lib/inventory`).
 *   • It never claims an item is "tracked" when it has no history on file.
 *     Movement written before the ledger shipped is listed as unchecked,
 *     because a claim of integrity is worth less than an admission of gaps.
 *   • It never hides a low item behind a colour. The count is stated.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Boxes, ClipboardList, History, Package, ShieldCheck, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/business-data';
import { useDukaanStore } from '@/lib/store';
import {
  MOVEMENT_LABEL,
  formatUnits,
  lowStockItems,
  movementsForProduct,
  reconcileLedger,
  stockValueAtCost,
  type StockMovement,
  type StockMovementReason,
} from '@/lib/inventory';

const REASON_TONE: Record<StockMovementReason, 'emerald' | 'brand' | 'amber' | 'sky' | 'slate'> = {
  opening: 'sky',
  sale: 'brand',
  'goods-inward': 'emerald',
  count: 'amber',
  return: 'slate',
};

function stamp(at: string) {
  return new Date(at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** One ledger line. `signed` is what left or arrived; `balance` is what is left. */
function MovementRow({ movement, showItem = false }: { movement: StockMovement; showItem?: boolean }) {
  const outgoing = movement.delta < 0;
  return (
    <li className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50/70 p-3">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          outgoing ? 'bg-amber-500/10 text-amber-700' : 'bg-emerald-500/10 text-emerald-700'
        }`}
      >
        {outgoing ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold tabular-nums text-stone-900">
            {movement.delta > 0 ? '+' : '−'}
            {formatUnits(Math.abs(movement.delta))}
            {movement.unit ? ` ${movement.unit}` : ''}
          </span>
          <Badge tone={REASON_TONE[movement.reason]}>{MOVEMENT_LABEL[movement.reason]}</Badge>
          {showItem ? <span className="text-sm font-medium text-stone-800">{movement.productName}</span> : null}
        </div>
        <p className="mt-1 text-xs text-stone-600">{movement.note}</p>
        <p className="mt-1 text-xs text-stone-500">
          {stamp(movement.at)} · after this: <span className="font-semibold tabular-nums text-stone-700">{formatUnits(movement.balance)}{movement.unit ? ` ${movement.unit}` : ''}</span>
          {movement.reference ? ` · ref ${movement.reference}` : ''}
        </p>
      </div>
    </li>
  );
}

export default function InventoryPage() {
  const { state } = useDukaanStore();
  const products = state.products.filter((product) => product.itemType === 'product');
  const movements = state.stockMovements;
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const stockValue = stockValueAtCost(state.products);
  const low = lowStockItems(state.products);
  const check = useMemo(() => reconcileLedger(state.products, movements), [state.products, movements]);
  const recent = useMemo(
    () => [...movements].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)),
    [movements],
  );
  const visibleRecent = showAll ? recent : recent.slice(0, 12);
  const todayCount = recent.filter((movement) => movement.at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <PageHeader
        eyebrow="Operations"
        title="Inventory"
        subtitle="Every unit that moves is written down: what left the shelf, why, and what was left. Open any item to read its history."
        actions={
          <>
            <Badge tone="brand">Value {formatCurrency(stockValue)}</Badge>
            {low.length > 0 ? <Badge tone="amber" dot>{low.length} to reorder</Badge> : null}
            <Badge tone={check.ok ? 'emerald' : 'amber'} dot>
              {check.ok ? 'Ledger reconciled' : `${check.mismatches.length} mismatch`}
            </Badge>
          </>
        }
      />

      {/* What the ledger is, in the owner's own terms, before the numbers. */}
      <Card className="animate-fade-up mb-6">
        <CardTitle icon={<ClipboardList size={16} />}>How stock moves here</CardTitle>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { step: '1', title: 'You add the item', body: 'Type the count you actually have — say 108 packets of kidney beans. That becomes the opening line.' },
            { step: '2', title: 'Someone buys three', body: 'The sale writes −3 and shows you 108 → 105 at the counter, at that moment.' },
            { step: '3', title: 'Every change leaves a line', body: 'Sales, deliveries, and your own re-counts. The last balance is the number on the shelf.' },
          ].map((item) => (
            <div key={item.step} className="rounded-xl border border-stone-200 bg-stone-50/70 p-4">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-700">{item.step}</span>
              <p className="mt-2 text-sm font-semibold text-stone-900">{item.title}</p>
              <p className="mt-1 text-xs text-stone-600">{item.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-600">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-600" />
            {check.items} item{check.items === 1 ? '' : 's'} tracked · {check.movements} movement{check.movements === 1 ? '' : 's'} on file
          </span>
          {!check.ok ? (
            <span className="inline-flex items-center gap-1.5 text-amber-700">
              <TriangleAlert size={14} />
              {check.mismatches.map((mismatch) => `${mismatch.name} (screen ${formatUnits(mismatch.onHand)} vs ledger ${formatUnits(mismatch.ledgerBalance)})`).join(', ')}
            </span>
          ) : null}
          {check.unchained.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-stone-500">
              <TriangleAlert size={14} />
              No history on file for {check.unchained.join(', ')} — the figure is right, but it predates the ledger.
            </span>
          ) : null}
        </div>
      </Card>

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No stocked items yet"
          description="Add items from the catalog with the count you have on the shelf. From then on, every sale and delivery moves the number and records why."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {products.map((product) => {
            const isLow = product.status === 'Active' && product.stock <= product.reorderLevel;
            const pct = Math.min(100, (product.stock / Math.max(product.reorderLevel * 3, 1)) * 100);
            const history = movementsForProduct(movements, product.id);
            const last = history[0];
            const open = openItem === product.id;
            return (
              <div
                key={product.id}
                className={`animate-fade-up relative overflow-hidden rounded-2xl border bg-stone-50 p-5 ring-1 ring-stone-200 transition ${isLow ? 'border-amber-500/40' : 'border-transparent'}`}
              >
                {isLow ? <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500" /> : <div className="absolute inset-x-0 top-0 h-1 bg-brand-gradient opacity-70" />}
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-100 text-stone-600"><Package size={17} /></span>
                  {isLow ? <Badge tone="amber" dot>Reorder</Badge> : <Badge tone="emerald" dot>In stock</Badge>}
                </div>
                <p className="mt-3 truncate text-sm font-medium text-stone-600">{product.name}</p>
                <p className="mt-1 font-display text-3xl font-bold tabular-nums text-stone-900">
                  {formatUnits(product.stock)}
                  {product.unit ? <span className="ml-1 text-sm font-medium text-stone-500">{product.unit}</span> : null}
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100">
                  <div className={`h-full rounded-full transition-all duration-700 ${isLow ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-brand-gradient'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-3 space-y-1 text-xs text-stone-600">
                  <p>Reorder at {formatUnits(product.reorderLevel)} · cost {formatCurrency(product.cost)}</p>
                  <p>On-hand value <span className="font-semibold text-stone-700 tabular-nums">{formatCurrency(product.stock * product.cost)}</span></p>
                  <p className="text-stone-500">
                    {last ? `Last moved ${stamp(last.at)} · ${last.delta > 0 ? '+' : '−'}${formatUnits(Math.abs(last.delta))}` : 'No movement history yet'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenItem(open ? null : product.id)}
                  className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 transition hover:border-brand-400/40 hover:text-brand-600"
                  aria-expanded={open}
                >
                  <History size={12} />
                  {open ? 'Hide history' : `History${history.length ? ` (${history.length})` : ''}`}
                </button>
                {open ? (
                  history.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {history.slice(0, 8).map((movement) => (
                        <MovementRow key={movement.id} movement={movement} />
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-600">
                      This item&apos;s stock figure was written before the ledger shipped. Correct it once above (or sell it) and every change from now on is recorded.
                    </p>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* The whole shop's recent movement, newest first — the audit trail a
          supplier dispute or a stock shortage is actually settled with. */}
      <Card className="animate-fade-up mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle icon={<Boxes size={16} />}>Recent stock movements</CardTitle>
          <div className="flex items-center gap-2">
            <Badge tone="slate">{todayCount} today</Badge>
            {recent.length > 12 ? (
              <button
                type="button"
                onClick={() => setShowAll((value) => !value)}
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 transition hover:border-brand-400/40 hover:text-brand-600"
              >
                {showAll ? 'Show latest 12' : `Show all ${recent.length}`}
              </button>
            ) : null}
          </div>
        </div>
        {recent.length === 0 ? (
          <p className="mt-4 text-sm text-stone-600">
            Nothing has moved yet. Record a{' '}
            <Link href="/sales" className="font-semibold text-brand-600 hover:underline">sale</Link>, receive a{' '}
            <Link href="/scan" className="font-semibold text-brand-600 hover:underline">delivery</Link>, or add stock in{' '}
            <Link href="/products" className="font-semibold text-brand-600 hover:underline">the catalog</Link> and it appears here.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {visibleRecent.map((movement) => (
              <MovementRow key={movement.id} movement={movement} showItem />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
