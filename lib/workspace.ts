import type { ModuleKey } from '@/lib/portals/types';
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

/** Consume only links already granted by the portal; never add access or mutate it. */
export function workspaceAreas(sections: readonly ResolvedNavSection[]): WorkspaceArea[] {
  const unique = new Map<string, ResolvedNavLink>();
  for (const section of sections) for (const link of section.links) {
    if (!unique.has(link.href)) unique.set(link.href, { ...link, label: LABELS[link.module] ?? link.label, keywords: `${link.keywords} ${link.label}` });
  }
  return WORK_AREAS.flatMap(area => {
    const links = area.modules.flatMap(module => [...unique.values()].filter(link => link.module === module));
    return links.length ? [{ id: area.id, label: area.label, description: area.description, links }] : [];
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
