import type { PortalId } from './business-types.ts';

export type Capability = 'billing' | 'barcode' | 'credit' | 'heldBills' | 'stockReview' | 'variants' | 'serials' | 'warranties' | 'expiry' | 'tables' | 'kitchenTickets' | 'modifiers' | 'appointments' | 'staffServices' | 'memberships' | 'attendance';
export type BusinessProfile = {
  id: PortalId; title: string; stockLabel: string; customerLabel: string;
  onboarding: string; available: readonly Capability[]; planned: readonly Capability[];
};
const retail: readonly Capability[] = ['billing', 'barcode', 'credit', 'heldBills'];
const profile = (id: PortalId, title: string, stockLabel: string, customerLabel: string, onboarding: string,
  planned: readonly Capability[], extra: readonly Capability[] = []): BusinessProfile =>
  ({ id, title, stockLabel, customerLabel, onboarding, available: [...retail, ...extra], planned });

/** Availability describes native desktop implementations; it never grants permissions. */
export const BUSINESS_PROFILES: Readonly<Record<PortalId, BusinessProfile>> = {
  general: profile('general', 'Retail & cycle stores', 'Items & spare parts', 'Customers & udhaar', 'Add your cycles and spare parts with their saved SKU, price and stock.', ['variants', 'serials', 'warranties']),
  kirana: profile('kirana', 'Grocery & kiryana', 'Stock & reorder', 'Udhaar khata', 'Save each barcode exactly as printed. Choose kg, litre, metre or pcs for each item.', ['expiry'], ['stockReview']),
  cafe: profile('cafe', 'Restaurants & cafés', 'Menu & pantry', 'Customers', 'Start with counter billing and menu prices. Table service and kitchen tickets are planned.', ['tables', 'kitchenTickets', 'modifiers']),
  salon: profile('salon', 'Salons', 'Services & products', 'Clients', 'Set up your customer list and retail products. Appointment and staff-service workflows are planned.', ['appointments', 'staffServices']),
  gym: profile('gym', 'Gyms', 'Products', 'Members', 'Set up your business and customer contacts. Membership plans and attendance are planned for the native app.', ['memberships', 'attendance']),
  electronics: profile('electronics', 'Electronics', 'Items & stock', 'Customers', 'Save products, prices and opening stock.', ['serials', 'warranties']),
  boutique: profile('boutique', 'Boutiques', 'Collections & stock', 'Customers', 'Use a separate saved SKU for each sellable item.', ['variants']),
  service: profile('service', 'Service businesses', 'Products', 'Clients', 'Set up your customer list and products.', ['appointments']),
};
export function businessProfile(id: PortalId): BusinessProfile { return BUSINESS_PROFILES[id]; }
export function hasCapability(id: PortalId, capability: Capability): boolean { return businessProfile(id).available.includes(capability); }

export type StockItem = { id: string; name: string; sku: string; unit: string; stockMilli: number };
/** A threshold always has a selling unit; kilograms are never compared to pieces. */
export function reorderItems<T extends StockItem>(items: readonly T[], unit: string, thresholdMilli: number): T[] {
  if (!['pcs', 'kg', 'litre', 'metre'].includes(unit) || !Number.isSafeInteger(thresholdMilli) || thresholdMilli < 0) throw new Error('Choose a valid unit and stock threshold.');
  return items.filter(item => item.unit === unit && item.stockMilli <= thresholdMilli)
    .sort((a, b) => a.stockMilli - b.stockMilli || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
