/** Native contract: integer paise, thousandths of a unit, tax in basis points.
 * Catalogue snapshots come from native storage, never renderer prices for posting.
 */
export const NATIVE_INVOICE_MAX = 9_000_000_000_000;

export type NativeInvoiceRequest = {
  operationId: string;
  lines: { productId: string; expectedRevision: number; quantityMilli: number }[];
  taxBasisPoints: number;
  tender: 'cash' | 'credit';
  customerId?: string | null;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 80
    && !/[^A-Za-z0-9_-]/.test(value);
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

/** Renderer preflight only. Native storage repeats validation and owns stock/prices.
 * Omitted and null cash customer references are equivalent in the native request.
 * Callers retain the same operation ID and input until posting is acknowledged.
 */
export function validateNativeInvoiceRequest(value: unknown): asserts value is NativeInvoiceRequest {
  if (!record(value)
    || Object.keys(value).some(key => !['operationId', 'lines', 'taxBasisPoints', 'tender', 'customerId'].includes(key))
    || !validId(value.operationId)
    || !Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 100
    || !integer(value.taxBasisPoints, 0, 10000)
    || (value.tender !== 'cash' && value.tender !== 'credit')
    || (value.customerId !== undefined && value.customerId !== null && !validId(value.customerId))
    || (value.tender === 'credit' && !validId(value.customerId))) {
    throw new Error('Invalid native invoice request');
  }
  for (const line of value.lines) {
    if (!record(line)
      || Object.keys(line).some(key => !['productId', 'expectedRevision', 'quantityMilli'].includes(key))
      || !validId(line.productId)
      || !integer(line.expectedRevision, 1, Number.MAX_SAFE_INTEGER)
      || !integer(line.quantityMilli, 1, NATIVE_INVOICE_MAX)) {
      throw new Error('Invalid native invoice line');
    }
  }
}

export function calculateNativeInvoice(
  lines: readonly { quantityMilli: number; unitPricePaise: number }[],
  taxBasisPoints: number,
) {
  if (!lines.length || lines.length > 100 || !integer(taxBasisPoints, 0, 10000)) {
    throw new Error('Invalid native invoice');
  }
  const max = BigInt(NATIVE_INVOICE_MAX);
  const lineTotalsPaise = lines.map(line => {
    if (!integer(line.quantityMilli, 1, NATIVE_INVOICE_MAX)
      || !integer(line.unitPricePaise, 0, NATIVE_INVOICE_MAX)) {
      throw new Error('Invalid native line');
    }
    const total = (BigInt(line.quantityMilli) * BigInt(line.unitPricePaise) + 500n) / 1000n;
    if (total > max) throw new Error('Invoice overflow');
    return Number(total);
  });
  const subtotal = lineTotalsPaise.reduce((sum, total) => sum + BigInt(total), 0n);
  const tax = (subtotal * BigInt(taxBasisPoints) + 5000n) / 10000n;
  if (subtotal <= 0n || subtotal + tax > max) throw new Error('Invoice overflow');
  return {
    lineTotalsPaise,
    subtotalPaise: Number(subtotal),
    taxPaise: Number(tax),
    totalPaise: Number(subtotal + tax),
  };
}
