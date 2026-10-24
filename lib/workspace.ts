import type { ModuleKey, PortalId } from '@/lib/portals/types';
import type { ResolvedNavLink, ResolvedNavSection } from '@/lib/portals/nav';

/** Stable jobs, independent of trade, trial status and the order of a portal's menu. */
export const WORK_AREAS = [
  { id: 'home', label: 'Home', description: 'Daily work and things that need attention.', modules: ['cockpit', 'alerts'] },
  { id: 'billing', label: 'Sales', description: 'Create a bill, find receipts and review recorded sales.', modules: ['billing', 'sales', 'scan'] },
  { id: 'stock', label: 'Products', description: 'Items, prices, stock levels and suppliers.', modules: ['catalog', 'inventory', 'suppliers'] },
  { id: 'customers', label: 'Customers', description: 'People, memberships, bookings and follow-ups.', modules: ['customers', 'memberships', 'appointments', 'checkins', 'reminders', 'marketing'] },
  { id: 'money', label: 'Finances', description: 'Collections, expenses, account balances and entries.', modules: ['payments', 'expenses', 'cashflow', 'transactions'] },
  { id: 'reports', label: 'Analytics', description: 'Business overview, margins, comparisons and exports.', modules: ['dashboard', 'reports', 'profitability', 'comparisons', 'insights'] },
  { id: 'settings', label: 'Settings', description: 'Business details, team access, security and your plan.', modules: ['settings', 'business', 'team', 'security', 'audit', 'subscription'] },
] as const satisfies ReadonlyArray<{ id: string; label: string; description: string; modules: readonly ModuleKey[] }>;

export type WorkAreaId = (typeof WORK_AREAS)[number]['id'];
export type WorkspaceArea = { id: WorkAreaId; label: string; description: string; links: ResolvedNavLink[] };

const LABELS: Partial<Record<ModuleKey, string>> = {
  cockpit: 'Home', alerts: 'Needs attention', billing: 'Bills & receipts', sales: 'Counter sales', scan: 'Barcode tools',
  catalog: 'Items & prices', inventory: 'Stock levels', cashflow: 'Account balances', transactions: 'Money entries',
  dashboard: 'Business overview', insights: 'Business insights', reports: 'Reports & exports', profitability: 'Margins',
  comparisons: 'Compare periods', settings: 'Preferences', business: 'Business details', team: 'Team & access',
  security: 'Security & backup', audit: 'Activity history', subscription: 'Your plan',
};


/** Business language stays consistent in desktop, mobile, search and tool browsing. */
const BUSINESS_AREAS: Partial<Record<PortalId, Partial<Record<WorkAreaId, { label: string; description: string }>>>> = {
  gym: { home: { label: 'Front desk', description: 'Check-ins, active members and upcoming renewals.' }, customers: { label: 'Members & plans', description: 'Members, plans, attendance and renewals.' }, reports: { label: 'Performance', description: 'Collections, expenses and business reports.' } },
  cafe: { home: { label: 'Service desk', description: 'Today’s bills, collections and pantry stock.' }, billing: { label: 'Counter & bills', description: 'Record an order and create a customer bill.' }, stock: { label: 'Menu & pantry', description: 'Menu items, prices, ingredients and suppliers.' }, customers: { label: 'Guests', description: 'Guest records and customer communication.' } },
  kirana: { home: { label: 'Shop counter', description: 'Daily billing, stock and customer balances.' }, stock: { label: 'Items & stock', description: 'Items, prices, stock levels and suppliers.' }, customers: { label: 'Khata', description: 'Customer records, outstanding balances and collections.' } },
  salon: { home: { label: 'Today', description: 'Appointments, clients and today’s collections.' }, stock: { label: 'Services', description: 'Service names, prices and your service catalogue.' }, customers: { label: 'Bookings & clients', description: 'Appointments, clients, packages and follow-ups.' } },
  service: { stock: { label: 'Services', description: 'Your services and price list.' }, customers: { label: 'Bookings & clients', description: 'Client records, bookings and follow-ups.' } },
};
const BUSINESS_LINKS: Partial<Record<PortalId, Partial<Record<ModuleKey, string>>>> = {
  gym: { cockpit: 'Front desk', customers: 'Members', memberships: 'Plans & members', reminders: 'Renewals', checkins: 'Check-ins' },
  cafe: { cockpit: 'Service desk', catalog: 'Menu', inventory: 'Pantry stock', sales: 'Counter orders', billing: 'Bills & receipts', customers: 'Guests', suppliers: 'Vendors' },
  kirana: { cockpit: 'Shop counter', customers: 'Udhaar khata', sales: 'Counter billing', catalog: 'Items & prices', inventory: 'Stock levels' },
  salon: { catalog: 'Services & prices', customers: 'Clients', memberships: 'Packages', appointments: 'Appointment book', reminders: 'Follow-ups' },
  service: { catalog: 'Services & prices', customers: 'Clients', appointments: 'Bookings', reminders: 'Follow-ups' },
};

/** Consume only links already granted by the portal; never add access or mutate it. */
export function workspaceAreas(sections: readonly ResolvedNavSection[], portalId: PortalId = 'general'): WorkspaceArea[] {
  const unique = new Map<string, ResolvedNavLink>();
  for (const section of sections) for (const link of section.links) {
    if (!unique.has(link.href)) unique.set(link.href, { ...link, label: BUSINESS_LINKS[portalId]?.[link.module] ?? LABELS[link.module] ?? link.label, keywords: `${link.keywords} ${link.label}` });
  }
  return WORK_AREAS.flatMap(area => {
    const links = area.modules.flatMap(module => [...unique.values()].filter(link => link.module === module));
    return links.length ? [{ id: area.id, label: BUSINESS_AREAS[portalId]?.[area.id]?.label ?? area.label, description: BUSINESS_AREAS[portalId]?.[area.id]?.description ?? area.description, links }] : [];
  });
}

export function workspaceLinkMatches(href: string, pathname: string | null): boolean {
  const path = pathname?.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
  return path === href || path.startsWith(`${href}/`);
}

export function activeWorkArea(areas: WorkspaceArea[], pathname: string | null): WorkspaceArea | undefined {
  return areas.find(area => area.links.some(link => workspaceLinkMatches(link.href, pathname)));
}

export function workspacePageTitle(areas: WorkspaceArea[], pathname: string | null): string {
  if (pathname === '/billing/new') return 'New bill';
  return areas.flatMap(area => area.links).find(link => workspaceLinkMatches(link.href, pathname))?.label ?? 'Workspace';
}
