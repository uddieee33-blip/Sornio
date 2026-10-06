/**
 * Scan resolution — from a code on a packet to a line on a bill.
 *
 * A counter scan is a question with five possible answers, and the shop has to
 * handle all five without ever guessing:
 *
 *   • **matched**    — one item claims the code. Add it and carry on.
 *   • **loose**      — an in-store weigh-scale label: the code carries the
 *                      weight (or the price), so the quantity comes from the
 *                      label, not from the counter.
 *   • **ambiguous**  — two items claim the same code. The owner fixes the
 *                      catalogue; the software refuses to pick one at random.
 *   • **unmatched**  — nobody claims it yet. This is the most useful outcome in
 *                      the whole feature: it is the shop telling the owner which
 *                      item still needs a code on file.
 *   • **invalid**    — the check digit failed, so it is a misread. Refused
 *                      before it can become a wrong bill.
 *
 * Matching order is deliberate: exact codes first (barcode, then the shop's own
 * internal code, then SKU), and *names are never used to complete a bill* —
 * a fuzzy name match only ever surfaces as a suggestion for a human to confirm.
 */

import type { Product } from '@/lib/business-data';
import { describeCode, normalizeCode, type CodeProfile, type LooseReading } from './barcodes';

export type MatchVia = 'barcode' | 'internal' | 'loose' | 'sku' | 'name';

export type ScanResolution =
  | {
      status: 'matched';
      profile: CodeProfile;
      product: Product;
      /**
       * What the item is worth on this line. For a packet it is what the scan
       * implies (use the `quantity` = `quantity`); for a loose label it is the
       * weight or the price the scale printed.
       */
      via: MatchVia;
      /** Units to bill. A plain packet is 1; a weigh-scale label is not. */
      quantity: number;
      /** The unit to bill in (“kg”, “pcs”) where the catalogue knows it. */
      unit?: string;
      /** Present when the code carried a weight or a price. */
      loose?: LooseReading;
      /** Plain-language explanation, shown at the counter. */
      reason: string;
    }
  | { status: 'ambiguous'; profile: CodeProfile; candidates: Product[]; reason: string }
  | { status: 'unmatched'; profile: CodeProfile; suggestions: Product[]; reason: string }
  | { status: 'invalid'; profile: CodeProfile; reason: string };

/** Case-insensitive code comparison: suppliers are inconsistent about case. */
const sameCode = (a: string | undefined, b: string) => Boolean(a) && a!.trim().toUpperCase() === b.trim().toUpperCase();

/** Every item claiming this exact code — usually one, sometimes two by mistake. */
export function itemsWithCode(code: string, products: Product[]): Product[] {
  const needle = normalizeCode(code);
  return products.filter(
    (product) => sameCode(product.barcode, needle) || sameCode(product.internalCode, needle),
  );
}

export function itemsWithSku(sku: string, products: Product[]): Product[] {
  const needle = normalizeCode(sku);
  return products.filter((product) => sameCode(product.sku, needle));
}

/** Rank an item against a typed code, for the “did you mean” list only. */
function suggestionScore(needle: string, product: Product): number {
  const haystacks = [product.name, product.sku ?? '', product.category, product.barcode ?? '', product.internalCode ?? ''];
  const query = needle.toLowerCase();
  let best = 0;
  for (const haystack of haystacks) {
    const value = haystack.toLowerCase();
    if (!value) continue;
    if (value === query) best = Math.max(best, 100);
    else if (value.startsWith(query)) best = Math.max(best, 70);
    else if (value.includes(query)) best = Math.max(best, 50);
  }
  return best;
}

export function suggestItems(code: string, products: Product[], limit = 5): Product[] {
  const needle = normalizeCode(code);
  if (needle.length < 2) return [];
  return products
    .map((product) => ({ product, score: suggestionScore(needle, product) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.product);
}

/**
 * The loose-item number a weigh-scale label carries for this product.
 *
 * `scaleNumber` is the single source of truth: the label printer writes it and
 * this matcher reads it, so a label printed for an item always scans back to
 * that item. Records created before scale numbers existed fall back to the
 * digits of the internal code, which is where the number was first derived
 * from — a label already stuck to a shelf must never become unscannable
 * because the convention was tidied up.
 */
function looseItemNumberOf(product: Product): number | null {
  if (typeof product.scaleNumber === 'number' && Number.isFinite(product.scaleNumber)) {
    return Math.trunc(product.scaleNumber);
  }
  const digits = /^DK(\d{8})\d$/.exec(product.internalCode ?? '')?.[1];
  return digits ? Number(digits) % 99_999 : null;
}

/**
 * Weigh a loose label against the catalogue.
 *
 * A weight label bills weight; a price label bills exactly the money the scale
 * asked for (which is why it is computed from the quantity, never typed in).
 * Units are respected: an item sold in kg takes the grams as kilograms, an item
 * sold loose in pieces takes the grams as pieces.
 */
function looseQuantity(product: Product, loose: LooseReading): { quantity: number; reason: string } {
  const unit = (product.unit ?? '').toLowerCase();
  if (loose.mode === 'price') {
    const price = loose.price ?? 0;
    if (product.sellingPrice <= 0) return { quantity: 1, reason: `the scale printed ₹${price}` };
    const quantity = Math.round((price / product.sellingPrice) * 1000) / 1000;
    return { quantity, reason: `the scale printed ₹${price} — billed as ${quantity} × ${product.sellingPrice}` };
  }

  const grams = loose.grams ?? 0;
  if (unit.startsWith('kg') || unit.startsWith('kilogram')) {
    const quantity = Math.round((grams / 1000) * 1000) / 1000;
    return { quantity, reason: `the scale printed ${grams} g — billed as ${quantity} kg` };
  }
  if (unit.startsWith('g') || unit.startsWith('gram')) {
    return { quantity: grams, reason: `the scale printed ${grams} g` };
  }
  // Sold loose by the piece (eggs, lemons, samosas): the grams on the label are
  // the count the scale was set to, and it is the count we bill.
  return { quantity: grams, reason: `the scale printed ${grams} ${unit || 'units'}` };
}

/**
 * Resolve one scan against the catalogue.
 *
 * `products` should be the live catalogue; archived items are excluded by the
 * caller when it wants a scan to only ever reach something it can actually sell.
 */
export function resolveScan(
  raw: string,
  products: Product[],
  options: { includeInactive?: boolean } = {},
): ScanResolution {
  const profile = describeCode(raw);
  const catalogue = options.includeInactive
    ? products
    : products.filter((product) => product.status === 'Active');

  if (!profile.code) {
    return { status: 'invalid', profile, reason: profile.note };
  }

  if (!profile.valid) {
    return {
      status: 'invalid',
      profile,
      reason: `${profile.note} Nothing was added — a misread must never become a wrong bill.`,
    };
  }

  // 1. An exact code on file. Two claimants is a catalogue problem to fix, not
  //    a coin to flip at the counter.
  const direct = itemsWithCode(profile.code, catalogue);
  if (direct.length > 1) {
    return {
      status: 'ambiguous',
      profile,
      candidates: direct,
      reason: `${direct.length} items on file claim this code (${direct.map((item) => item.name).join(', ')}). Fix the duplicate before billing it — the wrong one would move the wrong stock.`,
    };
  }
  if (direct.length === 1) {
    const product = direct[0];
    const via: MatchVia = sameCode(product.barcode, profile.code) ? 'barcode' : 'internal';
    return {
      status: 'matched',
      profile,
      product,
      via,
      quantity: 1,
      unit: product.unit,
      reason:
        via === 'barcode'
          ? `${product.name} — matched on its barcode.`
          : `${product.name} — matched on this shop’s own internal code.`,
    };
  }

  // 2. An in-store weigh-scale label: the code carries the quantity with it.
  if (profile.loose && profile.kind === 'in-store') {
    const number = Number(profile.loose.itemNumber);
    const owner = catalogue.find((product) => {
      const itemNumber = looseItemNumberOf(product);
      return itemNumber !== null && itemNumber === number;
    });
    if (owner) {
      const { quantity, reason } = looseQuantity(owner, profile.loose);
      return {
        status: 'matched',
        profile,
        product: owner,
        via: 'loose',
        quantity,
        unit: owner.unit,
        loose: profile.loose,
        reason: `${owner.name} — ${reason}.`,
      };
    }
    return {
      status: 'unmatched',
      profile,
      suggestions: [],
      reason: `An in-store label for loose item #${number}, but no item on file carries that number. Set the item's internal code to ${profile.code.slice(0, 7)}… once and every future label scans itself.`,
    };
  }

  // 3. The shop's own SKU (typed on the box, not always printed as a barcode).
  const bySku = itemsWithSku(profile.code, catalogue);
  if (bySku.length === 1) {
    const product = bySku[0];
    return {
      status: 'matched',
      profile,
      product,
      via: 'sku',
      quantity: 1,
      unit: product.unit,
      reason: `${product.name} — matched on its SKU/item code.`,
    };
  }
  if (bySku.length > 1) {
    return {
      status: 'ambiguous',
      profile,
      candidates: bySku,
      reason: `${bySku.length} items share the item code ${profile.code}. Make it unique before billing.`,
    };
  }

  // 4. Nothing claims it. Offer the closest names — for a human to confirm.
  const suggestions = suggestItems(profile.code, catalogue);
  return {
    status: 'unmatched',
    profile,
    suggestions,
    reason: `No item on file carries ${profile.code}. Link it to an existing item, or create a new item with this code in one step — then it scans itself forever.`,
  };
}
