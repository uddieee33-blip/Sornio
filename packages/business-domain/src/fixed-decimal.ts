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
