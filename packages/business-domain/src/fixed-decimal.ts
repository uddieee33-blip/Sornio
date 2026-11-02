/** Parse a typed price/quantity without floating-point rounding or exponent input. */
export function parseFixedDecimal(input: string, scale: 2 | 3, signed = false): number | null {
  const value = input.trim();
  if (value.length > 32 || !(signed ? /^-?\d+(?:\.\d+)?$/ : /^\d+(?:\.\d+)?$/).test(value)) return null;
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  if (fraction.length > scale) return null;
  const fixed = BigInt(whole) * (10n ** BigInt(scale)) + BigInt(fraction.padEnd(scale, '0'));
  if (fixed > 9_000_000_000_000n) return null;
  return Number(negative ? -fixed : fixed);
}

/** Positive half-up line paise matching native Rust billing::line_total. */
export function exactLinePaise(quantity: number, unitPrice: number): number | null {
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice) || quantity <= 0 || unitPrice < 0) return null;
  const quantityMilli = parseFixedDecimal(String(quantity), 3);
  const unitPricePaise = parseFixedDecimal(String(unitPrice), 2);
  if (quantityMilli === null || quantityMilli <= 0 || unitPricePaise === null) return null;
  const total = (BigInt(quantityMilli) * BigInt(unitPricePaise) + 500n) / 1000n;
  if (total > 9_000_000_000_000n) return null;
  return Number(total);
}

