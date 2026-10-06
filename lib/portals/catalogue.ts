/**
 * The canonical module catalogue.
 *
 * One entry per module: its route, its default label, its icon, and the words
 * that should match it in ⌘K. Portals overlay their own vocabulary on top of
 * this (`/customers` is "Members" in a gym, "Khata" in a kirana, "Guests" in a
 * café) — but the route never changes, so a link keeps working when a business
 * switches portal, and nothing has to be migrated.
 *
 * Pure data: safe to import from Edge middleware.
 */

import type { IconName, ModuleKey } from './types';

export type CatalogueEntry = {
  module: ModuleKey;
  href: string;
  label: string;
  icon: IconName;
  keywords: string;
  /**
   * Core modules belong to every business (trust, people, platform settings)
   * and can never be switched off by a portal.
   */
  core?: true;
};

export const MODULE_CATALOGUE: CatalogueEntry[] = [
  { module: 'cockpit', href: '/home', label: 'Owner Cockpit', icon: 'cockpit', keywords: 'today summary morning start', core: true },
  { module: 'dashboard', href: '/dashboard', label: 'Dashboard', icon: 'dashboard', keywords: 'charts kpi numbers' },
  { module: 'insights', href: '/insights', label: 'AI Insights', icon: 'insights', keywords: 'health score advice tips advice' },
  { module: 'alerts', href: '/alerts', label: 'Alerts', icon: 'alerts', keywords: 'warnings stock expiry attention' },
  { module: 'business', href: '/business', label: 'Business Setup', icon: 'business', keywords: 'profile portal template type switch', core: true },
  { module: 'catalog', href: '/products', label: 'Products', icon: 'catalog', keywords: 'catalog items price cost menu services' },
  { module: 'scan', href: '/scan', label: 'Scan Station', icon: 'scan', keywords: 'barcode barcodes scan scanner qr label code sticker imei weigh scale' },
  { module: 'inventory', href: '/inventory', label: 'Inventory', icon: 'inventory', keywords: 'stock levels pantry shelves reorder' },
  { module: 'checkins', href: '/check-ins', label: 'Check-ins', icon: 'checkins', keywords: 'attendance floor entry today who is in' },
  { module: 'appointments', href: '/appointments', label: 'Appointments', icon: 'appointments', keywords: 'bookings day book calendar slot' },
  { module: 'sales', href: '/sales', label: 'Sales', icon: 'sales', keywords: 'new sale counter billing order' },
  { module: 'billing', href: '/billing', label: 'Billing', icon: 'billing', keywords: 'invoice gst bill receipt tax' },
  { module: 'payments', href: '/payments', label: 'Payments', icon: 'payments', keywords: 'collect cash upi card settled' },
  { module: 'expenses', href: '/expenses', label: 'Expenses', icon: 'expenses', keywords: 'spend rent bills salary' },
  { module: 'transactions', href: '/transactions', label: 'Transactions', icon: 'transactions', keywords: 'ledger entries history' },
  { module: 'marketing', href: '/marketing', label: 'Marketing', icon: 'marketing', keywords: 'campaign spend ads offers' },
  { module: 'memberships', href: '/memberships', label: 'Memberships', icon: 'memberships', keywords: 'plans subscription renewal package' },
  { module: 'reminders', href: '/reminders', label: 'Reminders', icon: 'reminders', keywords: 'sms whatsapp expiry follow up renewal' },
  { module: 'customers', href: '/customers', label: 'Customers', icon: 'customers', keywords: 'clients members guests khata udhaar' },
  { module: 'suppliers', href: '/suppliers', label: 'Suppliers', icon: 'suppliers', keywords: 'vendors purchase payables' },
  { module: 'team', href: '/team', label: 'Team & Roles', icon: 'team', keywords: 'staff access permission cashier trainer', core: true },
  { module: 'cashflow', href: '/cashflow', label: 'Cash Flow', icon: 'cashflow', keywords: 'bank cash balance money in out' },
  { module: 'profitability', href: '/profitability', label: 'Profitability', icon: 'profitability', keywords: 'margin profit block' },
  { module: 'reports', href: '/reports', label: 'Reports', icon: 'reports', keywords: 'export csv download statements' },
  { module: 'comparisons', href: '/comparisons', label: 'Comparisons', icon: 'comparisons', keywords: 'month over month growth trend' },
  { module: 'audit', href: '/audit', label: 'Audit History', icon: 'audit', keywords: 'log changes trace verify chain', core: true },
  { module: 'security', href: '/security', label: 'Trust Centre', icon: 'security', keywords: 'security encryption privacy rbac backup', core: true },
  { module: 'settings', href: '/settings', label: 'Settings', icon: 'settings', keywords: 'preferences language currency receipts', core: true },
  // The platform's own billing. Core, like the Trust Centre: a business must
  // always be able to see what it is paying for and change it. A portal can
  // hide a shelf; it can never hide the invoice.
  { module: 'subscription', href: '/subscription', label: 'Your Plan', icon: 'plan', keywords: 'plan pricing upgrade pay billing subscription invoice trial lock', core: true },
];

const BY_MODULE = new Map<ModuleKey, CatalogueEntry>(MODULE_CATALOGUE.map((entry) => [entry.module, entry]));
const BY_HREF = new Map<string, CatalogueEntry>(MODULE_CATALOGUE.map((entry) => [entry.href, entry]));

export function entryForModule(module: ModuleKey): CatalogueEntry {
  const entry = BY_MODULE.get(module);
  if (!entry) throw new Error(`Unknown module: ${module}`);
  return entry;
}

export function entryForHref(href: string): CatalogueEntry | null {
  return BY_HREF.get(href) ?? null;
}

export const CORE_MODULES: ModuleKey[] = MODULE_CATALOGUE.filter((entry) => entry.core).map((entry) => entry.module);

/** All module keys, in nav order. */
export const ALL_MODULES: ModuleKey[] = MODULE_CATALOGUE.map((entry) => entry.module);
