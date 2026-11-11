import { countStorageKey, validateCount, type CountDraft, type CountScope } from '../../../../packages/business-domain/src/stock-count-draft.ts';
type Port = { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<void>; delete: (key: string) => Promise<void> };
/** One small encrypted record per product; no ledgers or snapshots in SecureStore. */
export function stockCounts(port: Port, scope: CountScope) {
  return {
    async read(productId: string): Promise<CountDraft | null> {
      const raw = await port.get(countStorageKey(scope, productId));
      if (raw === null) return null;
      if (raw.length * 3 > 1800) throw new Error('This saved count is too large to open securely.');
      const value: unknown = JSON.parse(raw); validateCount(value, scope, productId); return value;
    },
    async save(draft: CountDraft): Promise<void> {
      validateCount(draft, scope, draft.productId);
      const raw = JSON.stringify(draft);
      // Bound UTF-8 size conservatively for native values around 2 KB.
      if (raw.length * 3 > 1800) throw new Error('This count is too large to save securely.');
      await port.set(countStorageKey(scope, draft.productId), raw);
    },
    async remove(productId: string): Promise<void> { await port.delete(countStorageKey(scope, productId)); },
  };
}
