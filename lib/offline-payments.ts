import type { PaymentMethod } from '@/lib/models/billing';

/** A device without connectivity cannot verify an external digital settlement. */
export function offlineCollectionError(method: PaymentMethod, online: boolean): string | null {
  if (online || !['UPI', 'Card', 'Bank Transfer'].includes(method)) return null;
  return 'This device is offline. Keep the bill unpaid until you can verify the digital payment. Cash can be recorded offline.';
}
