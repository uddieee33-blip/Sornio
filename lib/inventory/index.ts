/**
 * The stock ledger — why 108 packets became 105, in writing.
 *
 * Every shop owner asks the same question the first time they use a computer at
 * the counter: *"the shelf had 108 packets, the customer took three — is the
 * computer really going to say 105, or is it going to lie to me?"* A number
 * that changes without an explanation is indistinguishable from a bug, and a
 * stock figure an owner does not trust is worse than a notebook.
 *
 * So stock is never just a column that gets overwritten. Every change writes a
 * **movement**: which item, how many units went in or out, why, what it was
 * before, and what is on the shelf now. The on-hand figure is the last balance
 * on that ledger, and the ledger is the receipt for it.
 *
 *   opening   108  · New item "Kidney beans — 1 kg", opening count 108
 *   sale       -3  · Sold 3 at the counter · balance 105
 *   inward    +24  · Delivery from Sharma Traders · balance 129
 *   count     -1   · Owner re-counted the shelf · balance 128
 *
 * Everything here is **pure and synchronous**: it takes products, movements and
 * a clock, and returns new ones. No storage, no React, no network — which is
 * exactly why a script can run the same functions the console runs and prove
 * the arithmetic (see `scripts/verify-inventory.mjs`). If the shop's ledger and
 * the shop's shelf ever disagree, `reconcileLedger` names the item.
 */

/** Why stock moved. Every movement is exactly one of these. */
export type StockMovementReason =
  /** The item was created with a counted opening stock. */
  | 'opening'
  /** Sold at the counter, typed or scanned. */
  | 'sale'
  /** Received from a supplier (goods inward). */
  | 'goods-inward'
  /** The owner re-counted the shelf and corrected the figure (damage, theft, spillage). */
  | 'count'
  /** A returned or cancelled sale coming back to the shelf. */
  | 'return';

/** One line of the stock ledger — a signed change and the balance it produced. */
export type StockMovement = {
  id: string;
  productId: string;
  /** Name copied at the time, so the ledger survives a renamed or deleted item. */
  productName: string;
  /** ISO timestamp of the change. */
  at: string;
  reason: StockMovementReason;
  /** Signed units: negative for anything leaving the shelf. Never zero. */
  delta: number;
  /** Units on hand *after* this change — the number the owner can physically count. */
  balance: number;
  /** One sentence a shopkeeper would say out loud. */
  note: string;
  /** What caused it: a sale reference, a supplier, or who counted. */
  reference?: string;
  /** Unit of measure at the time (`packet`, `kg`, `pcs`), for a readable ledger. */
  unit?: string;
};

/** Human wording for the ledger filter chips and the audit trail. */
export const MOVEMENT_LABEL: Record<StockMovementReason, string> = {
  opening: 'Opening stock',
  sale: 'Sold',
  'goods-inward': 'Goods received',
  count: 'Count corrected',
  return: 'Returned',
};

/** The ledger is a shop record, not a data lake: keep the newest 20,000 lines. */
export const STOCK_LEDGER_LIMIT = 20_000;

/**
 * The unit-safe arithmetic: stock can never go negative.
 *
 * Selling more than the shelf holds is refused *before* it is written (see the
 * store's `recordSale`), so this clamp is the second line of defence — for a
 * correction typed by hand, or data synced from an older device.
 */
export function balanceAfter(balance: number, delta: number): number {
  const next = round3((Number.isFinite(balance) ? balance : 0) + (Number.isFinite(delta) ? delta : 0));
  return next < 0 ? 0 : next;
}

/** Loose goods are weighed, so units carry three decimals; packets are whole. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** The unit a movement should quote, in the shop's words. */
export function unitFor(itemType: 'product' | 'service', unit?: string): string | undefined {
  if (itemType === 'service') return undefined;
  return unit && unit.trim() ? unit.trim() : undefined;
}

/**
 * Build the ledger line for one change.
 *
 * Deliberately a pure function of its inputs: the caller supplies the id and the
 * timestamp, so the same call produces the same line and a test can assert it.
 * A zero-unit change is not a movement and returns `null` — the ledger records
 * what actually happened, never padding.
 */
export function buildMovement(input: {
  id: string;
  productId: string;
  productName: string;
  at: string;
  reason: StockMovementReason;
  delta: number;
  /** On-hand *before* this change. */
  balanceBefore: number;
  note: string;
  reference?: string;
  unit?: string;
}): StockMovement | null {
  const delta = round3(input.delta);
  if (!Number.isFinite(delta) || delta === 0) return null;
  return {
    id: input.id,
    productId: input.productId,
    productName: input.productName,
    at: input.at,
    reason: input.reason,
    delta,
    balance: balanceAfter(input.balanceBefore, delta),
    note: input.note,
    ...(input.reference ? { reference: input.reference } : {}),
    ...(input.unit ? { unit: input.unit } : {}),
  };
}

/**
 * Newest first, capped — the order the ledger is always read in.
 *
 * Incoming lines lead the list (they are what just happened), and the result is
 * sorted by timestamp so a device that syncs an older movement cannot push it to
 * the top. The sort is stable and compares the timestamp only, so the several
 * lines of one sale keep the order they were written in.
 */
export function pushMovements(
  existing: StockMovement[],
  incoming: (StockMovement | null | undefined)[],
): StockMovement[] {
  const fresh = incoming.filter((movement): movement is StockMovement => movement != null);
  if (fresh.length === 0) return existing;
  return [...fresh, ...existing]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, STOCK_LEDGER_LIMIT);
}

/** Every movement for one item, newest first. */
export function movementsForProduct(movements: StockMovement[], productId: string): StockMovement[] {
  return movements.filter((movement) => movement.productId === productId);
}

/**
 * The shelf and the ledger must agree.
 *
 * For every item, walk its movements oldest-first and check that the final
 * balance equals the on-hand figure the console shows. A mismatch is reported
 * item by item rather than swallowed, because a silent disagreement between two
 * screens is exactly how an owner stops trusting the software.
 */
export type LedgerCheck = {
  ok: boolean;
  items: number;
  movements: number;
  /** Items whose ledger disagrees with their on-hand figure. */
  mismatches: { productId: string; name: string; onHand: number; ledgerBalance: number }[];
  /** Items with no movement history at all (legacy rows, or synced-in stock). */
  unchained: string[];
};

export function reconcileLedger(
  products: { id: string; name: string; itemType: 'product' | 'service'; stock: number }[],
  movements: StockMovement[],
): LedgerCheck {
  const byProduct = new Map<string, StockMovement[]>();
  for (const movement of movements) {
    const list = byProduct.get(movement.productId);
    if (list) list.push(movement);
    else byProduct.set(movement.productId, [movement]);
  }

  const mismatches: LedgerCheck['mismatches'] = [];
  const unchained: string[] = [];
  let items = 0;
  let counted = 0;

  for (const product of products) {
    if (product.itemType !== 'product') continue;
    items += 1;
    const list = byProduct.get(product.id);
    if (!list || list.length === 0) {
      unchained.push(product.name);
      continue;
    }
    counted += list.length;
    // Movements are stored newest-first; replay oldest-first to the last balance.
    const oldestFirst = [...list].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    const ledgerBalance = oldestFirst[oldestFirst.length - 1].balance;
    if (Math.abs(ledgerBalance - product.stock) > 0.0005) {
      mismatches.push({ productId: product.id, name: product.name, onHand: product.stock, ledgerBalance });
    }
  }

  return { ok: mismatches.length === 0, items, movements: counted, mismatches, unchained };
}

/** Items that have reached their reorder level and still sell. */
export function lowStockItems<T extends { itemType: 'product' | 'service'; status: string; stock: number; reorderLevel: number }>(
  products: T[],
): T[] {
  return products.filter(
    (product) => product.itemType === 'product' && product.status === 'Active' && product.stock <= product.reorderLevel,
  );
}

/** Total value of what is sitting on the shelves, at purchase cost. */
export function stockValueAtCost(products: { itemType: 'product' | 'service'; stock: number; cost: number }[]): number {
  return products
    .filter((product) => product.itemType === 'product')
    .reduce((sum, product) => sum + product.stock * product.cost, 0);
}

/** "108 → 105" — the sentence an owner wants to see after a sale. */
export function describeStockChange(movement: Pick<StockMovement, 'productName' | 'delta' | 'balance' | 'unit'>): string {
  const before = balanceAfter(movement.balance, -movement.delta);
  const unit = movement.unit ? ` ${pluralUnit(movement.unit, movement.delta)}` : '';
  return `${movement.productName}: ${formatUnits(before)} → ${formatUnits(movement.balance)}${unit}`;
}

/** `1 packet`, `3 packets` — the counter's wording, not the database's. */
export function pluralUnit(unit: string, quantity: number): string {
  return Math.abs(quantity) === 1 ? unit : `${unit}s`;
}

/** Trim the meaningless decimals off whole packets, keep them for weighed goods. */
export function formatUnits(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
}

/** A day stamp for grouping the ledger without pulling in a date library. */
export function movementDay(at: string): string {
  return at.slice(0, 10);
}
