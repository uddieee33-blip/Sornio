import type { PortalId } from './identity';

export type CompanionVocabulary = {
  customers: string;
  customerOne: string;
  catalog: string;
  catalogOne: string;
  stock: string;
  sale: string;
  saleOne: string;
  plans: string;
  staff: string;
  desk: string;
};

const BASE: CompanionVocabulary = {
  customers: 'Customers',
  customerOne: 'Customer',
  catalog: 'Products',
  catalogOne: 'Product',
  stock: 'Inventory',
  sale: 'Sales',
  saleOne: 'Invoice',
  plans: 'Memberships',
  staff: 'Team',
  desk: 'Counter',
};

const BY_PORTAL: Record<PortalId, CompanionVocabulary> = {
  gym: { ...BASE, customers: 'Members', customerOne: 'Member', catalog: 'Retail shelf', catalogOne: 'Retail item', stock: 'Retail stock', sale: 'Enrolment', saleOne: 'Enrolment receipt', plans: 'Plans', staff: 'Trainers', desk: 'Front desk' },
  cafe: { ...BASE, customers: 'Guests', customerOne: 'Guest', catalog: 'Menu', catalogOne: 'Dish', stock: 'Pantry', sale: 'Counter', saleOne: 'Bill', staff: 'Kitchen & floor team', desk: 'Counter' },
  kirana: { ...BASE, customers: 'Khata', customerOne: 'Khata', desk: 'Shop counter' },
  salon: { ...BASE, customers: 'Clients', customerOne: 'Client', catalog: 'Services', catalogOne: 'Service', stock: 'Retail stock', sale: 'Counter', saleOne: 'Bill', plans: 'Packages', staff: 'Stylists', desk: 'Reception' },
  electronics: { ...BASE, desk: 'Sales desk' },
  boutique: { ...BASE, catalog: 'Collections', catalogOne: 'Piece', desk: 'Shop floor' },
  service: { ...BASE, customers: 'Clients', customerOne: 'Client', catalog: 'Services', catalogOne: 'Service', saleOne: 'Invoice', desk: 'Workday' },
  general: BASE,
};

export function vocabularyFor(portalId: PortalId): CompanionVocabulary {
  return BY_PORTAL[portalId];
}
