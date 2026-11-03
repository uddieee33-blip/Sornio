/**
 * Integer-safe money and quantity for the mobile companion.
 *
 * Authoritative amounts travel as decimal digit strings of integer paise.
 * Quantities travel as decimal digit strings of integer milli-units.
 * Arithmetic uses BigInt only. JavaScript Number is never used for value math.
 *
 * Bounds match native billing MAX_VALUE (9_000_000_000_000 paise / milli).
 */

export const NATIVE_MAX_UNITS = 9_000_000_000_000n;
const INTEGER_PATTERN = /^-?(0|[1-9]\d*)$/;

export type PaiseString = string & { readonly __brand: 'paise' };
export type QuantityMilliString = string & { readonly __brand: 'quantityMilli' };

export class MoneyError extends Error {
  readonly code = 'MONEY_INVALID' as const;
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

function assertIntegerString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !INTEGER_PATTERN.test(value)) {
    throw new MoneyError(`${label} must be an integer decimal string.`);
  }
  if (value === '-0') throw new MoneyError(`${label} must not be negative zero.`);
  return value;
}

function toBigInt(value: string, label: string, signed: boolean): bigint {
  const parsed = BigInt(assertIntegerString(value, label));
  if (!signed && parsed < 0n) throw new MoneyError(`${label} must not be negative.`);
  if (parsed > NATIVE_MAX_UNITS || parsed < -NATIVE_MAX_UNITS) {
    throw new MoneyError(`${label} exceeds the native maximum.`);
  }
  return parsed;
}

export function parsePaise(value: unknown, signed = true): PaiseString {
  toBigInt(typeof value === 'string' ? value : '', 'Amount', signed);
  return value as PaiseString;
}

export function parseQuantityMilli(value: unknown, signed = false): QuantityMilliString {
  toBigInt(typeof value === 'string' ? value : '', 'Quantity', signed);
  return value as QuantityMilliString;
}

export function paiseFromRupeeDecimal(value: unknown): PaiseString {
  if (typeof value !== 'string' || value.length > 32) {
    throw new MoneyError('Rupee amount must be a decimal string.');
  }
  const signed = value.startsWith('-');
  const raw = signed ? value.slice(1) : value;
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    throw new MoneyError('Rupee amount must have at most two decimal places.');
  }
  const [whole, fraction = ''] = raw.split('.');
  const paise = BigInt(whole ?? '0') * 100n + BigInt(fraction.padEnd(2, '0'));
  if (paise > NATIVE_MAX_UNITS) throw new MoneyError('Rupee amount exceeds the native maximum.');
  return `${signed && paise !== 0n ? '-' : ''}${paise}` as PaiseString;
}

export function quantityFromDecimal(value: unknown): QuantityMilliString {
  if (typeof value !== 'string' || value.length > 32) {
    throw new MoneyError('Quantity must be a decimal string.');
  }
  if (!/^\d+(?:\.\d{1,3})?$/.test(value)) {
    throw new MoneyError('Quantity must have at most three decimal places.');
  }
  const [whole, fraction = ''] = value.split('.');
  const milli = BigInt(whole ?? '0') * 1000n + BigInt(fraction.padEnd(3, '0'));
  if (milli > NATIVE_MAX_UNITS) throw new MoneyError('Quantity exceeds the native maximum.');
  return `${milli}` as QuantityMilliString;
}

export function addPaise(a: PaiseString, b: PaiseString): PaiseString {
  const sum = toBigInt(a, 'Amount', true) + toBigInt(b, 'Amount', true);
  if (sum > NATIVE_MAX_UNITS || sum < -NATIVE_MAX_UNITS) {
    throw new MoneyError('Amount overflow.');
  }
  return `${sum}` as PaiseString;
}

export function subPaise(a: PaiseString, b: PaiseString): PaiseString {
  const difference = toBigInt(a, 'Amount', true) - toBigInt(b, 'Amount', true);
  if (difference > NATIVE_MAX_UNITS || difference < -NATIVE_MAX_UNITS) {
    throw new MoneyError('Amount overflow.');
  }
  return `${difference}` as PaiseString;
}

export function comparePaise(a: PaiseString, b: PaiseString): -1 | 0 | 1 {
  const left = toBigInt(a, 'Amount', true);
  const right = toBigInt(b, 'Amount', true);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isZeroPaise(value: PaiseString): boolean {
  return toBigInt(value, 'Amount', true) === 0n;
}

/** Indian grouping. Never converts the rupee total through Number. */
export function formatInr(paise: PaiseString): string {
  const value = toBigInt(paise, 'Amount', true);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const rupees = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, '0');
  const digits = rupees.toString();
  let grouped: string;
  if (digits.length <= 3) grouped = digits;
  else {
    const lastThree = digits.slice(-3);
    const head = digits.slice(0, -3);
    const pairs: string[] = [];
    for (let i = head.length; i > 0; i -= 2) {
      pairs.unshift(head.slice(Math.max(0, i - 2), i));
    }
    grouped = `${pairs.join(',')},${lastThree}`;
  }
  return `${negative ? '-' : ''}₹${grouped}.${fraction}`;
}

export function formatQuantity(milli: QuantityMilliString): string {
  const value = toBigInt(milli, 'Quantity', true);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 1000n;
  const fraction = (abs % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  const body = fraction.length === 0 ? whole.toString() : `${whole.toString()}.${fraction}`;
  return `${negative ? '-' : ''}${body}`;
}

export function paiseToRupeeDecimal(paise: PaiseString): string {
  const value = toBigInt(paise, 'Amount', true);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const rupees = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${rupees.toString()}.${fraction}`;
}

export function rejectUnsafeNumber(value: unknown, label: string): void {
  if (typeof value === 'number') {
    throw new MoneyError(`${label} arrived as a JavaScript number and was rejected.`);
  }
}
