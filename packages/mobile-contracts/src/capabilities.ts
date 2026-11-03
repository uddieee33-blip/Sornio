import { can, type Permission, type PortalId, type Role } from './identity';

/**
 * Feature class for the Phase 1 matrix.
 * F full mobile · R read-only mobile · L limited authenticated action
 * D desktop-only · P planned
 */
export type FeatureClass = 'F' | 'R' | 'L' | 'D' | 'P';

export const MODULE_KEYS = [
  'cockpit',
  'dashboard',
  'insights',
  'alerts',
  'business',
  'catalog',
  'scan',
  'inventory',
  'checkins',
  'appointments',
  'sales',
  'billing',
  'payments',
  'expenses',
  'transactions',
  'marketing',
  'memberships',
  'reminders',
  'customers',
  'suppliers',
  'team',
  'cashflow',
  'profitability',
  'reports',
  'comparisons',
  'audit',
  'security',
  'settings',
  'subscription',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const SCREEN_IDS = ['home', 'activity', 'inventory', 'customers', 'settings'] as const;
export type ScreenId = (typeof SCREEN_IDS)[number];

export type FeatureRow = {
  module: ModuleKey;
  desktop: FeatureClass;
  android: FeatureClass;
  ios: FeatureClass;
  ipad: FeatureClass;
  roles: Role[];
  offline: boolean;
  sync: boolean;
  backend: 'none' | 'hybrid-sync-v1' | 'missing';
  hardware: boolean;
  notes: string;
};

const VIEW_ROLES: Role[] = ['owner', 'manager', 'cashier', 'auditor'];
const REPORT_ROLES: Role[] = ['owner', 'manager', 'auditor'];

function row(
  module: ModuleKey,
  mobile: FeatureClass,
  notes: string,
  extra: Partial<FeatureRow> = {},
): FeatureRow {
  return {
    module,
    desktop: 'F',
    android: mobile,
    ios: mobile,
    ipad: mobile,
    roles: VIEW_ROLES,
    offline: mobile === 'R' || mobile === 'L',
    sync: mobile === 'R' || mobile === 'L',
    backend: mobile === 'D' || mobile === 'P' ? 'missing' : 'hybrid-sync-v1',
    hardware: false,
    notes,
    ...extra,
  };
}

/** Generated from lib/portals/catalogue.ts plus desktop hardware exclusions. */
export const FEATURE_MATRIX: FeatureRow[] = [
  row('cockpit', 'R', 'Owner home. Metrics from the companion snapshot only.'),
  row('dashboard', 'R', 'Summaries on Home. No independent charts.'),
  row('insights', 'P', 'Hosted AI insights are not a companion contract.'),
  row('alerts', 'R', 'Previously synchronized alerts only.'),
  row('business', 'L', 'Identity is visible. Portal switching stays desktop/web.'),
  row('catalog', 'R', 'Product search and details. No price edits.'),
  row('scan', 'D', 'USB counter scanner and weigh-label workflows stay desktop.', { hardware: true, offline: false, sync: false, backend: 'missing' }),
  row('inventory', 'R', 'Stock visibility. No independent deductions.', { roles: VIEW_ROLES }),
  row('checkins', 'R', 'Membership overview only. Fingerprint-pad attendance is desktop hardware.', { hardware: true }),
  row('appointments', 'R', 'Day-book visibility. Booking writes are Phase 4.'),
  row('sales', 'R', 'Sales history. Creating invoices is desktop-only in Phase 1.'),
  row('billing', 'R', 'Read-only bills. No GST invoice issuance on mobile.'),
  row('payments', 'R', 'Collections history. Recording a payment is desktop-only in Phase 1.'),
  row('expenses', 'R', 'Expense history. Creating expenses is desktop-only in Phase 1.'),
  row('transactions', 'R', 'Activity list. Authoritative ledger stays native.'),
  row('marketing', 'P', 'Campaign tools are not in the first five screens.'),
  row('memberships', 'R', 'Gym/salon plan overview. Enrolment writes stay desktop.'),
  row('reminders', 'P', 'Manual SMS drafts remain on web/desktop.'),
  row('customers', 'R', 'Balances and statements. Credit writes stay desktop.'),
  row('suppliers', 'P', 'Supplier payables are not in Phase 1 screens.'),
  row('team', 'R', 'Staff overview on Settings. Invites stay desktop.'),
  row('cashflow', 'R', 'Summary tiles. No closing or float correction.'),
  row('profitability', 'R', 'Read-only profitability figures when synchronized.'),
  row('reports', 'R', 'Simplified reports. CSV export stays desktop.', { roles: REPORT_ROLES }),
  row('comparisons', 'P', 'Month-over-month layout planned for Phase 4.'),
  row('audit', 'R', 'Visible as a status, not a full audit browser.', { roles: REPORT_ROLES }),
  row('security', 'L', 'Session, device and cache controls. Vault restore is desktop.', { roles: ['owner', 'manager'] }),
  row('settings', 'L', 'Appearance, sync status, sign out, cache wipe.'),
  row('subscription', 'D', 'Sornio plan billing is not sold inside the companion in Phase 1.', { offline: false, sync: false, backend: 'missing', roles: ['owner'] }),
];

export const PORTAL_MODULES: Record<PortalId, readonly ModuleKey[]> = {
  gym: ['cockpit', 'dashboard', 'insights', 'alerts', 'business', 'checkins', 'payments', 'expenses', 'transactions', 'marketing', 'memberships', 'reminders', 'customers', 'team', 'cashflow', 'profitability', 'reports', 'comparisons', 'audit', 'security', 'settings', 'subscription'],
  cafe: ['cockpit', 'dashboard', 'insights', 'alerts', 'business', 'catalog', 'scan', 'inventory', 'sales', 'billing', 'payments', 'expenses', 'transactions', 'marketing', 'customers', 'suppliers', 'team', 'cashflow', 'profitability', 'reports', 'comparisons', 'audit', 'security', 'settings', 'subscription'],
  kirana: ['cockpit', 'dashboard', 'insights', 'alerts', 'business', 'catalog', 'scan', 'inventory', 'sales', 'billing', 'payments', 'expenses', 'transactions', 'marketing', 'customers', 'suppliers', 'team', 'cashflow', 'profitability', 'reports', 'comparisons', 'audit', 'security', 'settings', 'subscription'],
  salon: ['cockpit', 'dashboard', 'insights', 'alerts', 'business', 'catalog', 'appointments', 'sales', 'billing', 'payments', 'expenses', 'transactions', 'marketing', 'memberships', 'reminders', 'customers', 'team', 'cashflow', 'profitability', 'reports', 'comparisons', 'audit', 'security', 'settings', 'subscription'],
  electronics: ['cockpit', 'dashboard', 'insights', 'alerts', 'business', 'catalog', 'scan', 'inventory', 'sales', 'billing', 'payments', 'expenses', 'transactions', 'marketing', 'customers', 'suppliers', 'team', 'cashflow', 'profitability', 'reports', 'comparisons', 'audit', 'security', 'settings', 'subscription'],
  boutique: ['cockpit', 'dashboard', 'insights', 'alerts', 'business', 'catalog', 'scan', 'inventory', 'sales', 'billing', 'payments', 'expenses', 'transactions', 'marketing', 'customers', 'suppliers', 'team', 'cashflow', 'profitability', 'reports', 'comparisons', 'audit', 'security', 'settings', 'subscription'],
  service: ['cockpit', 'dashboard', 'insights', 'alerts', 'business', 'catalog', 'appointments', 'sales', 'billing', 'payments', 'expenses', 'transactions', 'marketing', 'customers', 'team', 'cashflow', 'profitability', 'reports', 'comparisons', 'audit', 'security', 'settings', 'subscription'],
  general: ['cockpit', 'dashboard', 'insights', 'alerts', 'business', 'catalog', 'scan', 'inventory', 'sales', 'billing', 'payments', 'expenses', 'transactions', 'marketing', 'customers', 'suppliers', 'team', 'cashflow', 'profitability', 'reports', 'comparisons', 'audit', 'security', 'settings', 'subscription'],
};

const SCREEN_MODULE: Record<ScreenId, ModuleKey> = {
  home: 'cockpit',
  activity: 'transactions',
  inventory: 'inventory',
  customers: 'customers',
  settings: 'settings',
};

const SCREEN_PERMISSION: Record<ScreenId, Permission> = {
  home: 'business.view',
  activity: 'sales.view',
  inventory: 'products.view',
  customers: 'customers.view',
  settings: 'business.view',
};

export function portalHasModule(portalId: PortalId, module: ModuleKey): boolean {
  return PORTAL_MODULES[portalId].includes(module);
}

export function screensFor(role: Role, portalId: PortalId): ScreenId[] {
  return SCREEN_IDS.filter((screen) => {
    if (!can(role, SCREEN_PERMISSION[screen])) return false;
    const moduleKey = SCREEN_MODULE[screen];
    if (screen === 'home' || screen === 'settings') return true;
    return portalHasModule(portalId, moduleKey);
  });
}

export function featureFor(module: ModuleKey): FeatureRow {
  const row = FEATURE_MATRIX.find((item) => item.module === module);
  if (!row) throw new Error(`Unknown module ${module}`);
  return row;
}

export function isWriteBlocked(module: ModuleKey): boolean {
  const klass = featureFor(module).android;
  return klass === 'R' || klass === 'D' || klass === 'P';
}
