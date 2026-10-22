/** Platform authority is deployment configuration, never a shop role or user metadata. */
export function isPlatformOperator(userId: string | null | undefined, configuredIds: string): boolean {
  return Boolean(userId && configuredIds.split(',').map((id) => id.trim()).filter(Boolean).includes(userId));
}

export type KeyRequest = { businessId: string; planId: 'growth' | 'scale'; months: number; reference: string };

export function validateKeyRequest(value: unknown): KeyRequest | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.paymentVerified !== true || typeof v.businessId !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v.businessId) ||
    (v.planId !== 'growth' && v.planId !== 'scale') ||
    (v.months !== 1 && v.months !== 3 && v.months !== 12) ||
    typeof v.reference !== 'string') return null;
  if (v.planId === 'scale' && v.months === 1) return null;
  const reference = v.reference.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9 _./-]{1,79}$/.test(reference)) return null;
  return { businessId: v.businessId.toLowerCase(), planId: v.planId, months: v.months, reference };
}
