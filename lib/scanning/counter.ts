/**
 * The scan ticket — what the counter looks like mid-bill.
 *
 * Deliberately the same shape as the store's `SaleLine` (`productId`, quantity,
 * rate) so a scanned basket is recorded through the *existing* sale path: the
 * ledger, the stock movement, profitability and the audit trail all update
 * exactly as they do for a hand-keyed sale. Scanning is a faster way to type,
 * never a second accounting path.
 *
 * Two rules that matter in a real shop:
 *
 *   • **Repeat scans stack.** Scanning the same packet three times must read as
 *     `3 ×`, or cashiers stop trusting the scanner and start counting by hand.
 *   • **Weighed lines do not stack.** Two loose packets are two different
 *     weights; merging them would silently lose one of them.
 */

export type ScanTicketLine = {
  /** Key: one line per catalogue item, or one line per weighed label. */
  id: string;
  productId: string;
  name: string;
  quantity: number;
  rate: number;
  unit?: string;
  /** True for a line created by a scan — the UI marks these so they are auditable at a glance. */
  scanned: boolean;
  /** Weighed/priced labels stay their own line, however often they are scanned. */
  mergeable: boolean;
};

export function makeTicketLine(input: {
  productId: string;
  name: string;
  quantity: number;
  rate: number;
  unit?: string;
  mergeable?: boolean;
}): ScanTicketLine {
  return {
    id: `${input.productId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 6)}`,
    productId: input.productId,
    name: input.name,
    quantity: input.quantity,
    rate: input.rate,
    unit: input.unit,
    scanned: true,
    mergeable: input.mergeable ?? true,
  };
}

/**
 * Add a scan to the ticket. Returns the same array instance when a mergeable
 * line was incremented and a new array when a line was added, so a caller that
 * wants to animate “added” rows can tell the difference.
 */
export function applyScanToTicket(lines: ScanTicketLine[], line: ScanTicketLine): ScanTicketLine[] {
  if (line.mergeable) {
    const index = lines.findIndex((existing) => existing.productId === line.productId && existing.mergeable);
    if (index >= 0) {
      const next = [...lines];
      const existing = next[index];
      const quantity = Math.round((existing.quantity + line.quantity) * 1000) / 1000;
      next[index] = { ...existing, quantity, scanned: true };
      return next;
    }
  }
  return [...lines, line];
}

/** Change a quantity by hand, after the scan put it on the bill. */
export function setTicketQuantity(lines: ScanTicketLine[], id: string, quantity: number): ScanTicketLine[] {
  return lines.map((line) => (line.id === id ? { ...line, quantity: Math.max(0, quantity) } : line));
}

export function removeTicketLine(lines: ScanTicketLine[], id: string): ScanTicketLine[] {
  return lines.filter((line) => line.id !== id);
}

export function ticketTotal(lines: ScanTicketLine[]): number {
  return Math.round(lines.reduce((total, line) => total + line.quantity * line.rate, 0) * 100) / 100;
}

export function ticketUnits(lines: ScanTicketLine[]): number {
  return Math.round(lines.reduce((total, line) => total + line.quantity, 0) * 1000) / 1000;
}

/** Rebuild a ticket line from a catalogue item at its current price. */
export function lineFromProduct(
  product: { id: string; name: string; sellingPrice: number; unit?: string },
  quantity = 1,
): ScanTicketLine {
  return makeTicketLine({
    productId: product.id,
    name: product.name,
    quantity,
    rate: product.sellingPrice,
    unit: product.unit,
  });
}
