import { parseFixedDecimal } from './fixed-decimal.ts';
export type CountScope = { businessId: string; actorId: string; mode: 'demo' | 'live' };
export type CountDraft = CountScope & { version: 1; productId: string; observedMilli: string; countedMilli: string; snapshotAt: string; savedAt: string };
const validId = (id: string) => typeof id === 'string' && id.length > 0 && id.length <= 120 && !/[\u0000-\u001f\u007f]/.test(id);
const validMilli = (value: string) => typeof value === 'string' && /^\d{1,13}$/.test(value) && BigInt(value) <= 9_000_000_000_000n;
export function countDraft(scope: CountScope, productId: string, observedMilli: string, counted: string, snapshotAt: string): CountDraft {
  const milli = parseFixedDecimal(counted, 3);
  if (milli === null || milli < 0) throw new Error('Enter a non-negative quantity with up to three decimal places.');
  const draft: CountDraft = { ...scope, version: 1, productId, observedMilli, countedMilli: String(milli), snapshotAt, savedAt: new Date().toISOString() };
  validateCount(draft, scope, productId); return draft;
}
export function validateCount(value: unknown, scope: CountScope, productId: string): asserts value is CountDraft {
  const d = value as CountDraft | null;
  if (!d || d.version !== 1 || !validId(d.businessId) || !validId(d.actorId) || !validId(d.productId)
    || !['demo', 'live'].includes(d.mode) || d.businessId !== scope.businessId || d.actorId !== scope.actorId || d.mode !== scope.mode || d.productId !== productId
    || !validMilli(d.observedMilli) || !validMilli(d.countedMilli) || typeof d.savedAt !== 'string' || !Number.isFinite(Date.parse(d.savedAt))
    || typeof d.snapshotAt !== 'string' || !Number.isFinite(Date.parse(d.snapshotAt))) throw new Error('This saved count cannot be opened for the current business and user.');
}
export function countStorageKey(scope: CountScope, productId: string): string {
  if (![scope.businessId, scope.actorId, productId].every(validId) || !['demo', 'live'].includes(scope.mode)) throw new Error('Invalid count scope.');
  const hex = (id: string) => Array.from(id).map(c => c.codePointAt(0)!.toString(16).padStart(6, '0')).join('');
  return `sornio.count.v1.${scope.mode}.${hex(scope.businessId)}.${hex(scope.actorId)}.${hex(productId)}`;
}
export function displayCount(milli: string): string {
  if (!validMilli(milli)) throw new Error('Invalid quantity.');
  const n = BigInt(milli), fraction = String(n % 1000n).padStart(3, '0').replace(/0+$/, '');
  return `${n / 1000n}${fraction ? '.' + fraction : ''}`;
}
