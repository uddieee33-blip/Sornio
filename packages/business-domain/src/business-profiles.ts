import type { PortalId } from './business-types';

export type BusinessProfileId = 'retail' | 'cycle' | 'grocery' | 'restaurant' | 'salon' | 'gym';
export type Capability = 'billing' | 'barcode' | 'measuredUnits' | 'credit' | 'holdBills' | 'stockAlerts' | 'serials' | 'warranties' | 'suppliers' | 'expiry' | 'tables' | 'kitchenTickets' | 'modifiers' | 'appointments' | 'staffAssignment' | 'memberships' | 'attendance';
export type BusinessProfile = { id: BusinessProfileId; title: string; portal: PortalId; itemLabel: string;
  customerLabel: string; counterLabel: string; capabilities: readonly Capability[]; planned: readonly Capability[]; onboarding: readonly string[] };
const retail: readonly Capability[] = ['billing', 'barcode', 'measuredUnits', 'credit', 'holdBills', 'stockAlerts'];
/** Available capabilities reflect native workflows; planned capabilities never grant access. */
export const BUSINESS_PROFILES: Record<BusinessProfileId, BusinessProfile> = {
  retail: { id: 'retail', title: 'Retail store', portal: 'general', itemLabel: 'Items & stock', customerLabel: 'Customers', counterLabel: 'Counter', capabilities: retail,
    planned: ['suppliers'], onboarding: ['Add products and saved barcode codes', 'Count opening stock', 'Create a test bill'] },
  cycle: { id: 'cycle', title: 'Cycle & spare parts store', portal: 'general', itemLabel: 'Cycles & spare parts', customerLabel: 'Customers', counterLabel: 'Sales counter', capabilities: retail,
    planned: ['serials', 'warranties', 'suppliers'], onboarding: ['Give each size or variant its own saved product code', 'Count cycles and spare parts', 'Create a test bill'] },
  grocery: { id: 'grocery', title: 'Grocery & kiryana', portal: 'kirana', itemLabel: 'Stock & restock', customerLabel: 'Udhaar khata', counterLabel: 'Shop counter', capabilities: retail,
    planned: ['expiry', 'suppliers'], onboarding: ['Save product barcodes', 'Choose kg, litre or pieces per product', 'Review low stock and customer credit'] },
  restaurant: { id: 'restaurant', title: 'Restaurant & café', portal: 'cafe', itemLabel: 'Menu & stock', customerLabel: 'Customers', counterLabel: 'Counter bills', capabilities: ['billing', 'credit', 'holdBills'],
    planned: ['tables', 'kitchenTickets', 'modifiers'], onboarding: ['Add menu items', 'Set prices', 'Try a counter bill; table service is still in development'] },
  salon: { id: 'salon', title: 'Salon', portal: 'salon', itemLabel: 'Services & products', customerLabel: 'Clients', counterLabel: 'Service bills', capabilities: ['billing', 'credit', 'holdBills'],
    planned: ['appointments', 'staffAssignment'], onboarding: ['Add services as individual items', 'Add clients', 'Try a service bill; appointments are still in development'] },
  gym: { id: 'gym', title: 'Gym', portal: 'gym', itemLabel: 'Products & services', customerLabel: 'Customers', counterLabel: 'Front desk bills', capabilities: ['billing', 'credit', 'holdBills'],
    planned: ['memberships', 'attendance'], onboarding: ['Add products or services', 'Add customer accounts', 'Try front desk billing; membership tracking is still in development'] },
};
export function profileForPortal(portal: PortalId): BusinessProfile {
  const id = ({ kirana: 'grocery', cafe: 'restaurant', salon: 'salon', gym: 'gym' } as Partial<Record<PortalId, BusinessProfileId>>)[portal] ?? 'retail';
  return BUSINESS_PROFILES[id];
}
export function supports(profile: BusinessProfile, capability: Capability): boolean { return profile.capabilities.includes(capability); }
