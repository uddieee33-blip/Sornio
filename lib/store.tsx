'use client';

import { getActiveFormattingLocale } from './locale';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  demoCustomers,
  demoProducts,
  summarizeFinancials,
  type Product,
  type Transaction,
} from '@/lib/business-data';
import { isValidUpiId, normalizeUpiId, type BankDetails } from '@/lib/upi';
import { businessTemplates, defaultBusinessSettings, type BusinessSettings, type StaffRole } from '@/lib/models/business';
import { portalForTemplate, portalHasModule } from '@/lib/portals/registry';
import { currentSyncMode } from '@/lib/supabase/config';
import { pushStateToSupabase, type SyncStatus } from '@/lib/sync/supabase-sync';
import { GENESIS_HASH, appendAuditEntry, isChained, type AuditActor, type AuditSeverity } from '@/lib/security/audit';
import { vaultClear, vaultRead, vaultWrite } from '@/lib/security/vault';
import { debounce } from '@/lib/perf/idle';
import {
  buildMovement,
  describeStockChange,
  pushMovements,
  unitFor,
  type StockMovement,
} from '@/lib/inventory';
import { authorizeCollection } from '@/lib/plans/active';
import {
  buildSampleSubscriptions,
  defaultMembers,
  defaultMembershipPlans,
  defaultReminderTemplates,
  deriveSubscriptionStatus,
  type Member,
  type MembershipPlan,
  type MembershipSubscription,
  type ReminderTemplate,
} from '@/lib/models/membership';
import {
  sampleInvoices,
  samplePaymentRecords,
  type Invoice,
  type InvoiceItem,
  type PaymentMethod,
  type PaymentRecord,
} from '@/lib/models/billing';
import {
  buildInternalCode,
  guessSymbology,
  isValidGtin,
  looksLikeCode,
  normalizeCode,
  type BarcodeSymbology,
  type BiometricCredential,
  type ScanContext,
  type ScanEvent,
  type ScanOutcome,
  type ScanSource,
} from '@/lib/scanning';

export type Customer = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  /** Free-form details/notes about the customer */
  details?: string;
  /** Bank + UPI details used to derive the customer's unique payment QR */
  bank?: BankDetails;
  openingBalance: number;
  createdAt: string;
};

/** Traceable record of an important business or financial change. */
export type AuditEntry = {
  id: string;
  type: 'sale' | 'expense' | 'product' | 'customer' | 'membership' | 'invoice' | 'marketing' | 'settings' | 'system';
  actor: string;
  summary: string;
  reference?: string;
  createdAt: string;
  /** Hash-chain link fields — absent on history written before the chain shipped. */
  severity?: AuditSeverity;
  action?: string;
  actorId?: string;
  actorRole?: string;
  meta?: Record<string, string | number | boolean | null>;
  prev?: string;
  hash?: string;
};

/** How this device is currently holding the owner's data. */
export type PersistenceStatus =
  | { mode: 'loading' }
  | { mode: 'encrypted'; writtenAt: string }
  | { mode: 'plaintext'; warning: string }
  | { mode: 'memory'; warning: string };

/** A tracked marketing activity with its spend. */
export type MarketingCampaign = {
  id: string;
  name: string;
  channel: 'Social Media' | 'Google Ads' | 'Print' | 'Radio' | 'Events' | 'Referrals' | 'Other';
  spend: number;
  notes?: string;
  startDate: string;
};

/**
 * A front-desk check-in.
 *
 * Gyms, studios and clinics do not sell a transaction and leave — they track who
 * walked in and when. This is the record behind that: deliberately tiny, tied to
 * a member record, and never invented (a portal without the check-in module
 * simply never writes one).
 */
export type CheckIn = {
  id: string;
  memberId: string;
  /** Name copied at check-in time, so history survives a renamed member. */
  name: string;
  /** ISO timestamp of entry. */
  at: string;
  /** ISO timestamp of exit, if the desk recorded one. */
  outAt?: string;
  /** Who recorded it — 'Front desk', 'Owner', 'Self'. */
  by?: string;
};

/** One slot in a service business's day book (salon, clinic, studio, repairs). */
export type Appointment = {
  id: string;
  customerName: string;
  phone?: string;
  /** Service or treatment booked, e.g. "Hair colour". */
  service?: string;
  /** Stylist / technician / trainer handling it. */
  staff?: string;
  /** ISO timestamp of the slot. */
  startAt: string;
  minutes: number;
  status: 'booked' | 'arrived' | 'done' | 'cancelled';
  /** Expected or final value, used when the slot is marked done. */
  amount?: number;
  notes?: string;
  createdAt: string;
};

/** The live business identity — owner, business, and collection details. */
export type BusinessProfile = {
  name: string;
  /** Which business-type template shapes this business (see lib/models/business). */
  templateId: string;
  description: string;
  currency: string;
  timezone: string;
  /** Owner contact details captured at onboarding. */
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  /** The owner's own UPI ID for receiving payments (never bank credentials). */
  upiId?: string;
  /**
   * The owner's own bank + UPI details, used ONLY to derive their collection QR.
   * Never PINs, OTPs, passwords, or card numbers.
   */
  bank?: BankDetails;
};

export const defaultBusinessProfile: BusinessProfile = {
  name: 'My Business',
  templateId: '',
  description: '',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
};

/**
 * How each portal configures the operating settings inside the store.
 *
 * Derived from the portal blueprint rather than hand-maintained, so the sidebar
 * and the settings can never disagree: if a gym portal does not carry Inventory,
 * `allowInventory` is off in the same breath, because both read one definition.
 */
function presetForPortal(templateId: string): Partial<BusinessSettings> {
  const portal = portalForTemplate(templateId);
  const has = (module: Parameters<typeof portalHasModule>[1]) => portalHasModule(portal.id, module);
  return {
    allowMemberships: has('memberships'),
    allowInventory: has('inventory'),
    allowAppointments: has('appointments'),
    allowDigitalReceipts: true,
    allowPhysicalReceipts: true,
    receiptMode: has('billing') ? (has('memberships') ? 'both' : 'digital') : 'physical',
    sendSmsReminders: has('reminders'),
    sendWhatsappReminders: has('reminders'),
  };
}


export type StoreState = {
  /** True while viewing the clearly-separated demo business (sample data). */
  demoMode: boolean;
  profile: BusinessProfile;
  products: Product[];
  transactions: Transaction[];
  customers: Customer[];
  plans: MembershipPlan[];
  members: Member[];
  subscriptions: MembershipSubscription[];
  reminderTemplates: ReminderTemplate[];
  invoices: Invoice[];
  paymentRecords: PaymentRecord[];
  /** Front-desk check-ins (gyms, studios, clinics). Empty for other portals. */
  checkIns: CheckIn[];
  /** Every code read at a counter or a shelf — including the ones that matched nothing. */
  scanEvents: ScanEvent[];
  /**
   * Fingers enrolled at this business's desks. A credential id only: there is
   * no fingerprint here, and there cannot be one (see lib/scanning/fingerprint).
   */
  biometricCredentials: BiometricCredential[];
  /** The service day book (salons, studios, repair desks). Empty elsewhere. */
  appointments: Appointment[];
  /**
   * The stock ledger — every unit that moved, why, and the on-hand figure it
   * produced. `product.stock` is the latest balance on this ledger; the ledger
   * is the explanation for it (see `lib/inventory`).
   */
  stockMovements: StockMovement[];
  settings: BusinessSettings;
  audit: AuditEntry[];
  campaigns: MarketingCampaign[];
};

export type ActionResult = {
  ok: boolean;
  error?: string;
  /**
   * Machine-readable refusal reason, so the UI can offer the right way out
   * instead of a dead-end sentence. `collection-limit` means the plan's free
   * UPI allowance ran out — cash still works, and the plan page removes it.
   */
  code?: 'collection-limit';
};

/**
 * What a recorded sale did to the shelves.
 *
 * Handed back to the counter so the owner is told what changed — "Kidney beans:
 * 108 → 105" — instead of being asked to trust a number that moved on another
 * screen. Every entry is also a line in the stock ledger.
 */
export type SaleResult = ActionResult & { stockChanges?: StockMovement[] };

/** Actions that create a catalogue item hand back its id, so the caller can open it. */
export type ProductActionResult = ActionResult & { productId?: string };

export type SaleLine = { productId: string; quantity: number; rate: number };
export type InvoiceLine = { name: string; category: string; quantity: number; unitPrice: number };

const STORAGE_KEY = 'dukaanos-store-v5';

/**
 * CORE PRINCIPLE: a real business starts at ZERO. Every financial figure is
 * calculated from actually recorded activity — never fabricated.
 *
 * The demo business below is OPTIONAL and clearly separated (demoMode flag):
 * it exists only to demonstrate the product and never mixes with real records.
 */
function buildSeedLedger(): Transaction[] {
  const ledger: Transaction[] = [];
  let n = 0;
  const id = () => `seed-${(n += 1).toString(36)}`;
  const dayISO = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toISOString().slice(0, 10);
  };

  const fixedExpenses: { offset: number; description: string; amount: number; method: 'Bank Transfer' | 'Cash' | 'UPI' }[] = [
    { offset: 12, description: 'Rent expense', amount: 28000, method: 'Bank Transfer' },
    { offset: 9, description: 'Electricity expense', amount: 4200, method: 'Cash' },
    { offset: 6, description: 'Marketing expense', amount: 12000, method: 'UPI' },
    { offset: 3, description: 'Software expense', amount: 5600, method: 'UPI' },
    { offset: 1, description: 'Supplies expense', amount: 3400, method: 'Cash' },
  ];
  const fixedByOffset = new Map(fixedExpenses.map((entry) => [entry.offset, entry]));

  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = dayISO(offset);
    const t = 13 - offset;
    const wave = Math.sin(t / 2.1) * 0.5 + 0.5;

    // Two retail sales most days, growing gently through the fortnight.
    const soap = Math.round(5200 + wave * 3400 + ((t * 733) % 800));
    const tea = Math.round(2400 + Math.cos(t / 1.7) * 900 + ((t * 401) % 600) + t * 90);
    ledger.push(
      { id: id(), type: 'sale', description: 'Retail sale — Organic Soap', amount: soap, direction: 'in', account: 'revenue', paymentMethod: t % 2 === 0 ? 'Cash' : 'UPI', date },
      { id: id(), type: 'payment', description: 'Collection from retail sale', amount: soap, direction: 'in', account: t % 2 === 0 ? 'cash' : 'upi', paymentMethod: t % 2 === 0 ? 'Cash' : 'UPI', date },
      { id: id(), type: 'sale', description: 'Retail sale — Signature Tea', amount: tea, direction: 'in', account: 'revenue', paymentMethod: 'UPI', date },
      { id: id(), type: 'payment', description: 'UPI settlement', amount: tea, direction: 'in', account: 'upi', paymentMethod: 'UPI', date },
      { id: id(), type: 'stock_adjustment', description: 'Inventory reduction due to sale', amount: Math.round((soap + tea) * 0.42), direction: 'out', account: 'inventory', date },
    );

    // A membership purchase every fourth day.
    if (t % 4 === 2) {
      ledger.push(
        { id: id(), type: 'sale', description: 'Membership — Quarterly Plus', amount: 4999, direction: 'in', account: 'revenue', paymentMethod: 'Card', date },
        { id: id(), type: 'payment', description: 'Card payment for membership', amount: 4999, direction: 'in', account: 'card', paymentMethod: 'Card', date },
      );
    }

    // Weekly cash-to-bank sweep.
    if (t % 5 === 4) {
      ledger.push({ id: id(), type: 'transfer', description: 'Cash to bank transfer', amount: 15000, direction: 'out', account: 'bank', date });
    }

    const fixed = fixedByOffset.get(offset);
    if (fixed) {
      const methodAccount = fixed.method === 'Cash' ? 'cash' : fixed.method === 'UPI' ? 'upi' : 'bank';
      ledger.push(
        { id: id(), type: 'expense', description: fixed.description, amount: fixed.amount, direction: 'out', account: 'expense', paymentMethod: fixed.method, date },
        { id: id(), type: 'payment', description: `${fixed.method} paid for ${fixed.description.replace(/ expense$/, '').toLowerCase()}`, amount: fixed.amount, direction: 'out', account: methodAccount, paymentMethod: fixed.method, date },
      );
    }
  }

  return ledger;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function addMonths(reference: Date, months: number): string {
  const date = new Date(reference);
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
}

function formatAuditAmount(value: number): string {
  return `₹${value.toLocaleString(getActiveFormattingLocale(), { maximumFractionDigits: 0 })}`;
}

function methodAccount(method: PaymentMethod): Transaction['account'] {
  switch (method) {
    case 'Cash':
      return 'cash';
    case 'UPI':
      return 'upi';
    case 'Card':
      return 'card';
    case 'Bank Transfer':
      return 'bank';
    default:
      return 'receivables';
  }
}

function methodGateway(method: PaymentMethod): PaymentRecord['gateway'] {
  if (method === 'Cash') return 'Cash';
  if (method === 'UPI') return 'UPI';
  return 'Razorpay';
}

/** A completely new business at zero — the default state of DukaanOS. */
/**
 * Sample stock movements for the demo business.
 *
 * Built *backwards* from the demo catalogue's final on-hand figure, so the
 * sample ledger genuinely reconciles: the last balance on each item's history
 * equals the number the inventory screen shows. A demo that does not add up
 * would teach an owner to distrust the real one.
 */
function buildSampleStockMovements(): StockMovement[] {
  const daysAgo = (days: number, hour = 10) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  };

  const ledger: StockMovement[] = [];
  demoProducts.forEach((product, index) => {
    if (product.itemType !== 'product' || product.stock <= 0) return;
    const sold = 2 + (index % 4);
    const received = index % 2 === 0 ? 5 : 0;
    const opening = Math.max(product.stock - received + sold, sold);

    const steps: { reason: StockMovement['reason']; delta: number; at: string; note: string; reference?: string; before: number }[] = [
      {
        reason: 'opening',
        delta: opening,
        at: daysAgo(9),
        note: `Opening count ${opening}${product.unit ? ` ${product.unit}` : ''} — counted when the item was added`,
        before: 0,
      },
    ];
    let balance = opening;
    steps.push({
      reason: 'sale',
      delta: -sold,
      at: daysAgo(2, 17),
      note: `Sold — ${sold} × ${product.name} at the counter`,
      reference: 'sale-demo',
      before: balance,
    });
    balance -= sold;
    if (received > 0) {
      steps.push({
        reason: 'goods-inward',
        delta: received,
        at: daysAgo(1, 11),
        note: `Goods received from ${product.supplier ?? 'supplier'} — ${received} × ${product.name}`,
        reference: product.supplier,
        before: balance,
      });
    }

    // Newest first on the ledger, so the array is reversed as it is collected.
    for (const step of [...steps].reverse()) {
      const movement = buildMovement({
        id: `mv-demo-${product.id}-${step.reason}`,
        productId: product.id,
        productName: product.name,
        at: step.at,
        reason: step.reason,
        delta: step.delta,
        balanceBefore: step.before,
        note: step.note,
        reference: step.reference,
        unit: unitFor(product.itemType, product.unit),
      });
      if (movement) ledger.push(movement);
    }
  });
  return ledger;
}

export function buildEmptyState(): StoreState {
  return {
    demoMode: false,
    profile: { ...defaultBusinessProfile },
    products: [],
    transactions: [],
    customers: [],
    plans: [],
    members: [],
    subscriptions: [],
    reminderTemplates: [],
    invoices: [],
    paymentRecords: [],
    checkIns: [],
    scanEvents: [],
    biometricCredentials: [],
    appointments: [],
    stockMovements: [],
    settings: defaultBusinessSettings,
    audit: [
      {
        id: newId('audit'),
        type: 'system',
        actor: 'System',
        summary: 'Business created. All balances start at ₹0 and will move only as real activity is recorded.',
        createdAt: new Date().toISOString(),
      },
    ],
    campaigns: [],
  };
}

/**
 * Sample scans for the demo counter: two that matched (one packet, one weighed
 * label) and one that did not — because showing only the happy path would teach
 * an owner nothing about what the scanner does when it meets an unknown packet.
 */
function buildSampleScanEvents(): ScanEvent[] {
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const events: ScanEvent[] = [
    {
      id: 'scan-demo-1',
      code: '8901234567890',
      symbology: 'EAN-13',
      source: 'wedge',
      context: 'counter',
      outcome: 'matched',
      productId: 'p1',
      productName: 'Organic Soap',
      quantity: 1,
      at: at(42),
      by: 'Counter',
    },
    {
      id: 'scan-demo-2',
      code: '2100001030001',
      symbology: 'EAN-13',
      source: 'wedge',
      context: 'counter',
      outcome: 'matched',
      productId: 'p5',
      productName: 'Loose Almonds',
      quantity: 3,
      at: at(27),
      by: 'Counter',
    },
    {
      id: 'scan-demo-3',
      code: '8905678901234',
      symbology: 'EAN-13',
      source: 'wedge',
      context: 'counter',
      outcome: 'unmatched',
      at: at(11),
      by: 'Counter',
    },
    {
      id: 'scan-demo-4',
      code: '8903456789012',
      symbology: 'EAN-13',
      source: 'camera',
      context: 'inward',
      outcome: 'matched',
      productId: 'p4',
      productName: 'Bamboo Mug',
      quantity: 6,
      at: at(4),
      by: 'Counter',
    },
  ];
  return events;
}

/**
 * Sample check-ins for the demo gym — a plausible morning at the front desk.
 * Only ever used inside `buildSeedState` (the clearly-labelled demo business).
 */
function buildSampleCheckIns(): CheckIn[] {
  const at = (hoursAgo: number, minutesAgo = 0) =>
    new Date(Date.now() - hoursAgo * 3600_000 - minutesAgo * 60_000).toISOString();
  const roster: { memberId: string; at: string; out?: string }[] = [
    { memberId: 'member-1', at: at(5, 10), out: at(4, 5) },
    { memberId: 'member-4', at: at(3, 40) },
    { memberId: 'member-2', at: at(2, 15) },
    { memberId: 'member-5', at: at(1, 5), out: at(0, 20) },
    { memberId: 'member-3', at: at(0, 35) },
  ];
  return roster.map((row, index) => ({
    id: `ci-demo-${index + 1}`,
    memberId: row.memberId,
    name: defaultMembers.find((member) => member.id === row.memberId)?.name ?? 'Member',
    at: row.at,
    outAt: row.out,
    by: 'Front desk',
  }));
}

/**
 * OPTIONAL demo business — rich sample data, clearly flagged with demoMode.
 * Loaded only on explicit owner action; never the default.
 */
export function buildSeedState(): StoreState {
  return {
    demoMode: true,
    profile: {
      name: 'Cult Fitness',
      templateId: 'template-gym',
      description: 'Neighborhood gym with membership plans, personal training, and renewal automation.',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      ownerName: 'Rohit Kapoor',
      ownerPhone: '+91 98100 12345',
      ownerEmail: 'rohit@cultfitness.in',
      upiId: 'cultfitness@okhdfcbank',
      bank: {
        upiId: 'cultfitness@okhdfcbank',
        bankName: 'HDFC Bank',
        accountNumber: '50100234567890',
        ifsc: 'HDFC0001234',
        accountHolder: 'Rohit Kapoor',
      },
    },
    products: demoProducts,
    // The demo business carries a ledger too — a sample shop where stock moved
    // with reasons, so an owner can read a movement history before trusting
    // their own. Nothing here is fiction dressed as the owner's data: it lives
    // only behind the clearly-marked demo mode.
    stockMovements: buildSampleStockMovements(),
    transactions: buildSeedLedger(),
    customers: demoCustomers.map((customer, index) => ({
      id: `customer-${index + 1}`,
      name: customer.name,
      phone: ['+91 98111 22334', '+91 97222 33445', '+91 96333 44556'][index],
      email: ['riya.sharma@gmail.com', 'amit.verma@outlook.com', 'nisha.patel@gmail.com'][index],
      details: [
        'Regular since 2024 · prefers evening pickups',
        'Wholesale buyer · bills on weekends',
        'Premium member · festival season orders',
      ][index],
      bank: [
        { upiId: 'riya.sharma@okhdfcbank', bankName: 'HDFC Bank', accountNumber: '50100234567890', ifsc: 'HDFC0001234', accountHolder: 'Riya Sharma' },
        { upiId: 'amit.verma@ybl', bankName: 'Yes Bank', accountNumber: '0987654321012345', ifsc: 'YESB0000456', accountHolder: 'Amit Verma' },
        { upiId: 'nisha.patel@paytm', bankName: 'Paytm Payments Bank', accountNumber: '919633344556', ifsc: 'PYTM0000789', accountHolder: 'Nisha Patel' },
      ][index],
      openingBalance: customer.balance,
      createdAt: '2026-09-01T09:00:00.000Z',
    })),
    plans: defaultMembershipPlans,
    members: defaultMembers,
    subscriptions: buildSampleSubscriptions(),
    reminderTemplates: defaultReminderTemplates,
    invoices: sampleInvoices,
    paymentRecords: samplePaymentRecords,
    checkIns: buildSampleCheckIns(),
    scanEvents: buildSampleScanEvents(),
    biometricCredentials: [],
    appointments: [],
    settings: defaultBusinessSettings,
    audit: [
      { id: 'audit-demo-1', type: 'system', actor: 'System', summary: 'Demo business loaded — sample data, clearly separated from real records.', createdAt: new Date().toISOString() },
      { id: 'audit-demo-2', type: 'sale', actor: 'Front Desk', summary: 'Sample ledger seeded with 14 days of retail, membership, and expense activity.', createdAt: new Date().toISOString() },
    ],
    campaigns: [
      { id: 'camp-1', name: 'Diwali Offers', channel: 'Social Media', spend: 7500, notes: 'Festive push on Instagram + WhatsApp status.', startDate: new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10) },
      { id: 'camp-2', name: 'Google Search — local', channel: 'Google Ads', spend: 4500, notes: 'Brand + “near me” keywords.', startDate: new Date(Date.now() - 11 * 864e5).toISOString().slice(0, 10) },
    ],
  };
}

export type StoreActions = {
  addProduct: (input: Omit<Product, 'id'>) => ActionResult;
  toggleProductStatus: (productId: string) => void;
  recordSale: (input: {
    lines: SaleLine[];
    method: PaymentMethod;
    customerName?: string;
    /** Where the lines came from — a scanned basket is audited as a scan. */
    source?: 'scan' | 'manual';
  }) => SaleResult;
  recordExpense: (input: { category: string; amount: number; method: PaymentMethod }) => ActionResult;
  addCustomer: (input: { name: string; phone?: string; email?: string; details?: string; bank?: BankDetails }) => ActionResult;
  updateCustomer: (customerId: string, patch: Partial<Pick<Customer, 'name' | 'phone' | 'email' | 'details' | 'bank' | 'openingBalance'>>) => ActionResult;
  addPlan: (input: { name: string; type: MembershipPlan['type']; durationMonths: number; price: number; description?: string }) => ActionResult;
  addMember: (input: { name: string; phone: string; preferredChannel: Member['preferredChannel'] }) => ActionResult;
  enrollMember: (input: { memberId: string; planId: string; method: PaymentMethod }) => ActionResult;
  renewSubscription: (input: { subscriptionId: string; method: PaymentMethod }) => ActionResult;
  checkInMember: (input: { memberId: string }) => ActionResult;
  endCheckIn: (checkInId: string) => ActionResult;
  // ---- Scanning (see lib/scanning) ----
  /** Record a read — including, and especially, the ones that matched nothing. */
  recordScan: (input: {
    code: string;
    source: ScanSource;
    context: ScanContext;
    outcome: ScanOutcome;
    symbology?: BarcodeSymbology;
    productId?: string;
    productName?: string;
    quantity?: number;
    by?: string;
  }) => void;
  /** Attach a scanned code to an existing item. Refuses a code another item already claims. */
  assignCode: (input: { productId: string; code: string }) => ActionResult;
  /** Mint a DukaanOS internal code for an item that will never carry a printed one. */
  mintInternalCode: (productId: string) => ProductActionResult;
  /** Turn an unknown scanned code into a catalogue item in one step. */
  createProductFromScan: (input: {
    code: string;
    name: string;
    category: string;
    itemType: 'product' | 'service';
    sellingPrice: number;
    cost: number;
    stock: number;
    reorderLevel: number;
    unit?: string;
    taxRate?: number;
    looseMode?: 'none' | 'weight' | 'price';
  }) => ProductActionResult;
  /** Goods inward: scans that raise stock at the purchase price they came in at. */
  recordStockInward: (input: {
    lines: { productId: string; quantity: number; cost?: number }[];
    supplier?: string;
  }) => ActionResult;
  // ---- Fingerprint check-in (gym & fitness) ----
  enrollBiometric: (input: { memberId: string; credentialId: string; label: string }) => ActionResult;
  revokeBiometric: (credentialId: string) => ActionResult;
  checkInWithBiometric: (input: { credentialId: string }) => ActionResult;
  addAppointment: (input: {
    customerName: string;
    phone?: string;
    service?: string;
    staff?: string;
    startAt: string;
    minutes?: number;
    amount?: number;
    notes?: string;
  }) => ActionResult;
  setAppointmentStatus: (appointmentId: string, status: Appointment['status']) => ActionResult;
  createInvoice: (input: { customerName: string; customerPhone?: string; lines: InvoiceLine[]; method: PaymentMethod; taxRate: number }) => ActionResult;
  /**
   * Settle an invoice. The desk may pass the method the money actually arrived
   * by (the front-desk collection flow) — otherwise the method already on the
   * invoice is used.
   */
  markInvoicePaid: (invoiceId: string, method?: PaymentMethod) => ActionResult;
  updateProduct: (productId: string, patch: Partial<Omit<Product, 'id'>>) => ActionResult;
  addCampaign: (input: { name: string; channel: MarketingCampaign['channel']; spend: number; notes?: string }) => ActionResult;
  updateProfile: (patch: Partial<BusinessProfile>) => ActionResult;
  applyTemplate: (templateId: string) => ActionResult;
  loadDemoBusiness: () => void;
  startFreshBusiness: () => void;
  syncNow: () => Promise<void>;
  updateSettings: (patch: Partial<BusinessSettings>) => ActionResult;
  /**
   * Switch who is sitting at this console. The PIN check for switching *up*
   * lives in the UI (it owns the counter-lock PIN); the store just records
   * the change it was asked for, on the audit trail like everything else.
   */
  setActiveRole: (role: StaffRole) => ActionResult;
  /**
   * Writes a plan change into the same hash-chained audit history as every
   * other financial decision — including ours. `summary` is the owner-facing
   * sentence; nothing about a plan is recorded that a business may not read.
   */
  recordPlanEvent: (summary: string) => void;
  resetDemo: () => void;
};

type StoreContextValue = {
  state: StoreState;
  actions: StoreActions;
  hydrated: boolean;
  /** Persistence mode: local-first demo, or live Supabase sync when configured. */
  syncStatus: SyncStatus;
  /** How the business is being stored on this device right now. */
  persistence: PersistenceStatus;
};

/**
 * Splitting the two contexts is a performance decision, not tidiness: a
 * component that only dispatches an action (`useDukaanActions`) no longer
 * re-renders every time a transaction is recorded. Components that need the
 * data still subscribe to the state context, exactly as before.
 */
const StoreStateContext = createContext<Omit<StoreContextValue, 'actions'> | null>(null);
const StoreActionsContext = createContext<StoreActions | null>(null);

/** Build the revenue + payment transaction pair for a completed sale. */
/**
 * The plan's one real limit, enforced where money is recorded.
 *
 * Counting is done from the ledger itself (`lib/plans/usage.ts`), so the number
 * the owner sees and the number that gates them are the same number. Only the
 * metered (UPI/bank) path is gated: a shop at its free allowance can always
 * keep billing in cash, and nothing already recorded is ever touched.
 */
function meterCollection(
  method: PaymentMethod,
  transactions: Transaction[],
  timeZone: string,
): ActionResult {
  const refusal = authorizeCollection(method, transactions, timeZone);
  if (!refusal) return { ok: true };
  return { ok: false, error: refusal.error, code: 'collection-limit' };
}

function buildRevenueTransactions(description: string, amount: number, method: PaymentMethod, customerLabel?: string): Transaction[] {
  const date = todayISO();
  return [
    {
      id: newId('t'),
      type: 'sale',
      description: customerLabel ? `${description} — ${customerLabel}` : description,
      amount,
      direction: 'in',
      account: 'revenue',
      paymentMethod: method,
      date,
    },
    {
      id: newId('t'),
      type: 'payment',
      description: `${method} received for ${description.toLowerCase()}`,
      amount,
      direction: 'in',
      account: methodAccount(method),
      paymentMethod: method,
      date,
    },
  ];
}

export function DukaanStoreProvider({ children }: { children: ReactNode }) {
  // A real business starts at zero. Demo data is opt-in and clearly separated.
  const [state, setState] = useState<StoreState>(buildEmptyState);
  const [hydrated, setHydrated] = useState(false);

  // A ref that always mirrors the latest committed state so memoized actions
  // read fresh data. React 19 forbids writing to a ref during render, so the
  // mirror is refreshed after commit instead. Every consumer reads it from an
  // event handler or async callback, which by definition runs after commit, so
  // no reader can observe a stale value.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const [persistence, setPersistence] = useState<PersistenceStatus>({ mode: 'loading' });

  // Hydrate from the encrypted vault after mount, so server and client first
  // renders match. Falls back to the legacy plaintext key and migrates it.
  useEffect(() => {
    let cancelled = false;

    const merge = (parsed: StoreState): StoreState => ({
      ...parsed,
      demoMode: parsed.demoMode ?? false,
      profile: parsed.profile ?? defaultBusinessProfile,
      // Older saves predate newer switches (roles, receipt flags): defaults
      // fill the gaps so a returning business never reads `undefined`.
      settings: { ...defaultBusinessSettings, ...(parsed.settings ?? {}) },
      audit: Array.isArray(parsed.audit) ? parsed.audit : [],
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      products: Array.isArray(parsed.products) ? parsed.products : [],
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      checkIns: Array.isArray(parsed.checkIns) ? parsed.checkIns : [],
      scanEvents: Array.isArray(parsed.scanEvents) ? parsed.scanEvents : [],
      biometricCredentials: Array.isArray(parsed.biometricCredentials) ? parsed.biometricCredentials : [],
      appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [],
      // Ledgers written before the stock ledger shipped have no movements. They
      // are reported as "unchained" on the inventory page rather than invented.
      stockMovements: Array.isArray(parsed.stockMovements) ? parsed.stockMovements : [],
    });

    const looksValid = (value: StoreState | undefined): value is StoreState =>
      Boolean(value && Array.isArray(value.transactions) && Array.isArray(value.products));

    (async () => {
      let restored: StoreState | null = null;

      const vaultResult = await vaultRead<StoreState>(STORAGE_KEY);
      if (vaultResult.ok && looksValid(vaultResult.data)) {
        restored = merge(vaultResult.data);
      } else {
        // One-time migration from the pre-vault plaintext key.
        try {
          const legacyRaw = window.localStorage.getItem(STORAGE_KEY);
          if (legacyRaw) {
            const parsed = JSON.parse(legacyRaw) as StoreState;
            if (looksValid(parsed)) restored = merge(parsed);
          }
        } catch {
          // Unreadable legacy data: start clean rather than crash.
        }
      }

      if (cancelled) return;
      if (restored) setState(restored);
      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced encrypted persistence. Writing on every keystroke would burn
  // main-thread time; 600 ms is imperceptible and survives a tab close.
  const persist = useMemo(
    () =>
      debounce((snapshot: StoreState) => {
        void vaultWrite(STORAGE_KEY, snapshot).then((result) => {
          if (result.ok && result.encrypted) {
            setPersistence({ mode: 'encrypted', writtenAt: new Date().toISOString() });
          } else if (result.ok) {
            setPersistence({ mode: 'plaintext', warning: result.warning });
          } else {
            setPersistence({ mode: 'memory', warning: result.error });
          }
        });
      }, 600),
    [],
  );

  useEffect(() => {
    if (!hydrated) return;
    persist(state);
  }, [state, hydrated, persist]);

  // Flush the pending write if the owner closes the tab mid-debounce.
  useEffect(() => {
    const flush = () => {
      persist.cancel();
      void vaultWrite(STORAGE_KEY, stateRef.current);
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      persist.cancel();
    };
  }, [persist]);

  // ---- Supabase sync (active only when real credentials are configured) ----
  const supabaseMode = currentSyncMode() === 'supabase';
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(supabaseMode ? 'idle' : 'local');
  const [authed, setAuthed] = useState(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect a signed-in owner once after hydration. Without a session we stay local.
  useEffect(() => {
    if (!supabaseMode || !hydrated) return;
    let cancelled = false;
    import('@/lib/supabase/client')
      .then(({ getBrowserSupabaseClient }) => getBrowserSupabaseClient().auth.getUser())
      .then(({ data }) => {
        if (!cancelled) setAuthed(Boolean(data.user));
      })
      .catch(() => {
        if (!cancelled) setAuthed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supabaseMode, hydrated]);

  const syncingEnabled = supabaseMode && authed && hydrated;

  // Debounced push: any state change schedules a background sync 2s later.
  useEffect(() => {
    if (!syncingEnabled) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      setSyncStatus('syncing');
      pushStateToSupabase(stateRef.current)
        .then((result) => setSyncStatus(result.ok ? 'synced' : 'error'))
        .catch(() => setSyncStatus('error'));
    }, 2000);
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [state, syncingEnabled]);

  // The audit chain is written through a promise queue so rapid actions can
  // never interleave two entries and produce a false "tampered" verdict.
  const auditQueue = useRef<Promise<void>>(Promise.resolve());

  const actions = useMemo<StoreActions>(() => {
    /**
     * Append a traceable, hash-chained audit record.
     *
     * Each entry stores the hash of the entry before it, so deleting or editing
     * history in storage is detectable (see the Trust Centre). Fire-and-forget
     * by design: the action itself must never wait on hashing.
     */
    const track = (type: AuditEntry['type'], summary: string, reference?: string) => {
      auditQueue.current = auditQueue.current
        .then(async () => {
          const actor: AuditActor = { id: 'local-owner', name: 'Owner', role: 'owner' };
          const previousHash =
            stateRef.current.audit.find((entry) => isChained(entry))?.hash ?? GENESIS_HASH;
          const event = await appendAuditEntry(previousHash, {
            category: type,
            action: type,
            severity: type === 'system' || type === 'settings' ? 'notice' : 'info',
            actor,
            summary,
            meta: reference ? { reference } : undefined,
          });

          const entry: AuditEntry = {
            id: event.id,
            type,
            actor: event.actor.name,
            summary: event.summary,
            reference,
            createdAt: event.at,
            // Everything needed to re-verify this entry later, byte for byte.
            severity: event.severity,
            action: event.action,
            actorId: event.actor.id,
            actorRole: event.actor.role,
            meta: event.meta,
            prev: event.prev,
            hash: event.hash,
          };

          setState((current) => ({ ...current, audit: [entry, ...current.audit].slice(0, 300) }));
        })
        .catch(() => {
          // Hashing is best-effort; a failed link must not block the business.
        });
    };

    return ({
    addProduct(input) {
      if (!input.name.trim()) return { ok: false, error: 'Item name is required.' };
      if (input.sellingPrice < 0 || input.cost < 0 || input.stock < 0) {
        return { ok: false, error: 'Prices and stock cannot be negative.' };
      }
      const productId = newId('p');
      const name = input.name.trim();
      setState((current) => ({
        ...current,
        products: [...current.products, { ...input, id: productId, name }],
        // Opening stock is a movement like any other: the first balance on the
        // item's ledger is the count the owner typed, not an unexplained number.
        stockMovements: pushMovements(current.stockMovements, [
          input.itemType === 'product'
            ? buildMovement({
                id: newId('mv'),
                productId,
                productName: name,
                at: new Date().toISOString(),
                reason: 'opening',
                delta: input.stock,
                balanceBefore: 0,
                note: `New item${input.category ? ` in ${input.category}` : ''} — opening count ${input.stock}${input.unit ? ` ${input.unit}` : ''}`,
                unit: unitFor(input.itemType, input.unit),
              })
            : null,
        ]),
      }));
      track('product', `Product \"${name}\" added to the catalog.`);
      return { ok: true };
    },

    toggleProductStatus(productId) {
      setState((current) => ({
        ...current,
        products: current.products.map((product) =>
          product.id === productId
            ? { ...product, status: product.status === 'Active' ? 'Inactive' : 'Active' }
            : product,
        ),
      }));
    },

    recordSale({ lines, method, customerName, source }) {
      const validLines = lines.filter((line) => line.quantity > 0 && line.rate >= 0);
      if (validLines.length === 0) return { ok: false, error: 'Add at least one line with a quantity.' };

      for (const line of validLines) {
        const product = stateRef.current.products.find((item) => item.id === line.productId);
        if (!product) return { ok: false, error: 'Select a valid item on every line.' };
        if (product.itemType === 'product' && line.quantity > product.stock) {
          return { ok: false, error: `Not enough stock for ${product.name} (${product.stock} left).` };
        }
      }

      const total = validLines.reduce((sum, line) => sum + line.quantity * line.rate, 0);
      if (total <= 0) return { ok: false, error: 'Sale total must be greater than zero.' };

      // The plan gate sits before anything is written: a refused collection
      // leaves the ledger exactly as it was, so a limit can never corrupt books.
      const metered = meterCollection(method, stateRef.current.transactions, stateRef.current.profile.timezone);
      if (!metered.ok) return metered;

      const date = todayISO();
      const label = customerName?.trim() || undefined;
      const at = new Date().toISOString();
      const saleReference = newId('sale');
      /** The ledger lines this sale writes — returned so the counter can show them. */
      const stockChanges: StockMovement[] = [];

      setState((current) => {
        const newTransactions: Transaction[] = buildRevenueTransactions(
          source === 'scan' ? `Counter scan — ${validLines.length} item(s)` : `Sale of ${validLines.length} item(s)`,
          total,
          method,
          label,
        );

        // Traceability: record exactly which items were sold, at what rate and cost.
        newTransactions[0].items = validLines.map((line) => {
          const product = current.products.find((item) => item.id === line.productId);
          return { productId: line.productId, name: product?.name ?? 'Item', quantity: line.quantity, rate: line.rate, cost: product?.cost ?? 0 };
        });

        // Inventory reduction at cost for physical goods.
        for (const line of validLines) {
          const product = current.products.find((item) => item.id === line.productId);
          if (product && product.itemType === 'product' && product.cost > 0) {
            newTransactions.push({
              id: newId('t'),
              type: 'stock_adjustment',
              description: `Inventory reduction — ${product.name}`,
              amount: line.quantity * product.cost,
              direction: 'out',
              account: 'inventory',
              date,
            });
          }
        }

        // The stock ledger: one line per item that left the shelf, carrying the
        // balance the owner can go and count. This is what makes "108 became
        // 105" checkable instead of merely asserted.
        const movements = validLines.map((line) => {
          const product = current.products.find((item) => item.id === line.productId);
          if (!product || product.itemType !== 'product') return null;
          return buildMovement({
            id: newId('mv'),
            productId: product.id,
            productName: product.name,
            at,
            reason: 'sale',
            delta: -line.quantity,
            balanceBefore: product.stock,
            note: `${source === 'scan' ? 'Scanned sale' : 'Sold'} — ${line.quantity} × ${product.name}${label ? ` to ${label}` : ''}`,
            reference: saleReference,
            unit: unitFor(product.itemType, product.unit),
          });
        });
        stockChanges.splice(0, stockChanges.length, ...movements.filter((movement): movement is StockMovement => movement !== null));

        return {
          ...current,
          transactions: [...current.transactions, ...newTransactions],
          stockMovements: pushMovements(current.stockMovements, movements),
          products: current.products.map((product) => {
            const line = validLines.find((entry) => entry.productId === product.id);
            if (!line || product.itemType !== 'product') return product;
            return { ...product, stock: Math.max(product.stock - line.quantity, 0) };
          }),
        };
      });
      const scannedUnits = validLines.filter((line) => line.quantity > 0).length;
      track(
        'sale',
        source === 'scan'
          ? `Scanned sale of ${formatAuditAmount(total)} recorded via ${method} — ${scannedUnits} line(s) read at the counter${label ? ` for ${label}` : ''}.`
          : `Sale of ${formatAuditAmount(total)} recorded via ${method}${label ? ` for ${label}` : ''}.`,
      );
      return { ok: true, stockChanges };
    },

    recordPlanEvent(summary) {
      // The plan itself is our own financial decision, so it lands in the same
      // tamper-evident history as the owner's — one chain, no exceptions.
      track('settings', summary.slice(0, 240));
    },

    recordExpense({ category, amount, method }) {
      if (!category.trim()) return { ok: false, error: 'Choose an expense category.' };
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
      const date = todayISO();
      const label = category.trim();
      setState((current) => ({
        ...current,
        transactions: [
          ...current.transactions,
          {
            id: newId('t'),
            type: 'expense',
            description: `${label} expense`,
            amount,
            direction: 'out',
            account: 'expense',
            paymentMethod: method,
            date,
          },
          {
            id: newId('t'),
            type: 'payment',
            description: `${method} paid for ${label.toLowerCase()}`,
            amount,
            direction: 'out',
            account: methodAccount(method),
            paymentMethod: method,
            date,
          },
        ],
      }));
      track('expense', `${category} expense of ${formatAuditAmount(amount)} paid via ${method}.`);
      return { ok: true };
    },

    addCustomer({ name, phone, email, details, bank }) {
      if (!name.trim()) return { ok: false, error: 'Customer name is required.' };
      if (bank?.upiId && !isValidUpiId(bank.upiId)) return { ok: false, error: 'That UPI ID does not look valid (expected something like name@bank).' };
      const cleanBank: BankDetails | undefined = bank
        ? {
            upiId: bank.upiId ? normalizeUpiId(bank.upiId) : undefined,
            bankName: bank.bankName?.trim() || undefined,
            accountNumber: bank.accountNumber?.trim() || undefined,
            ifsc: bank.ifsc?.trim().toUpperCase() || undefined,
            accountHolder: bank.accountHolder?.trim() || undefined,
          }
        : undefined;
      setState((current) => ({
        ...current,
        customers: [
          ...current.customers,
          {
            id: newId('customer'),
            name: name.trim(),
            phone: phone?.trim() || undefined,
            email: email?.trim() || undefined,
            details: details?.trim() || undefined,
            bank: cleanBank,
            openingBalance: 0,
            createdAt: new Date().toISOString(),
          },
        ],
      }));
      track('customer', `Customer \"${name.trim()}\" added.`);
      return { ok: true };
    },

    updateCustomer(customerId, patch) {
      if (patch.bank?.upiId && !isValidUpiId(patch.bank.upiId)) return { ok: false, error: 'That UPI ID does not look valid (expected something like name@bank).' };
      setState((current) => ({
        ...current,
        customers: current.customers.map((customer) => {
          if (customer.id !== customerId) return customer;
          const nextBank = patch.bank === undefined ? customer.bank : { ...customer.bank, ...patch.bank };
          return {
            ...customer,
            ...patch,
            bank: nextBank,
            name: patch.name !== undefined ? patch.name.trim() : customer.name,
          };
        }),
      }));
      track('customer', 'Customer profile updated.');
      return { ok: true };
    },

    addPlan({ name, type, durationMonths, price, description }) {
      if (!name.trim()) return { ok: false, error: 'Plan name is required.' };
      if (!Number.isFinite(durationMonths) || durationMonths <= 0) return { ok: false, error: 'Duration must be at least one month.' };
      if (!Number.isFinite(price) || price <= 0) return { ok: false, error: 'Plan price must be greater than zero.' };
      setState((current) => ({
        ...current,
        plans: [
          ...current.plans,
          { id: newId('plan'), businessId: 'biz-1', name: name.trim(), type, durationMonths, price, description, isActive: true },
        ],
      }));
      track('membership', `Membership plan \"${name.trim()}\" created (${durationMonths} month(s), ${formatAuditAmount(price)}).`);
      return { ok: true };
    },

    addMember({ name, phone, preferredChannel }) {
      if (!name.trim()) return { ok: false, error: 'Member name is required.' };
      if (!phone.trim()) return { ok: false, error: 'Member phone is required.' };
      setState((current) => ({
        ...current,
        members: [
          ...current.members,
          { id: newId('member'), businessId: 'biz-1', name: name.trim(), phone: phone.trim(), preferredChannel, createdAt: new Date().toISOString() },
        ],
      }));
      track('membership', `Member \"${name.trim()}\" added to the directory.`);
      return { ok: true };
    },

    enrollMember({ memberId, planId, method }) {
      const plan = stateRef.current.plans.find((item) => item.id === planId);
      const member = stateRef.current.members.find((item) => item.id === memberId);
      if (!plan) return { ok: false, error: 'Choose a plan.' };
      if (!member) return { ok: false, error: 'Choose a member.' };
      const metered = meterCollection(method, stateRef.current.transactions, stateRef.current.profile.timezone);
      if (!metered.ok) return metered;
      const now = new Date();
      const expiryDate = addMonths(now, plan.durationMonths);
      setState((current) => ({
        ...current,
        subscriptions: [
          ...current.subscriptions,
          {
            id: newId('sub'),
            businessId: 'biz-1',
            memberId,
            planId,
            startDate: now.toISOString(),
            expiryDate,
            autoRenew: false,
            status: deriveSubscriptionStatus(expiryDate, now),
            createdAt: now.toISOString(),
          },
        ],
        transactions: [
          ...current.transactions,
          ...buildRevenueTransactions(`${plan.name} membership`, plan.price, method, member.name),
        ],
      }));
      track('membership', `Membership enrollment recorded — payment via ${method}.`);
      return { ok: true };
    },

    renewSubscription({ subscriptionId, method }) {
      const subscription = stateRef.current.subscriptions.find((item) => item.id === subscriptionId);
      const plan = subscription ? stateRef.current.plans.find((item) => item.id === subscription.planId) : undefined;
      if (!subscription || !plan) return { ok: false, error: 'Subscription not found.' };
      const metered = meterCollection(method, stateRef.current.transactions, stateRef.current.profile.timezone);
      if (!metered.ok) return metered;
      const member = stateRef.current.members.find((item) => item.id === subscription.memberId);
      const now = new Date();
      const expiryDate = addMonths(now, plan.durationMonths);
      setState((current) => ({
        ...current,
        subscriptions: current.subscriptions.map((item) =>
          item.id === subscriptionId
            ? { ...item, startDate: now.toISOString(), expiryDate, status: deriveSubscriptionStatus(expiryDate, now), reminderSentAt: undefined }
            : item,
        ),
        transactions: [
          ...current.transactions,
          ...buildRevenueTransactions(`${plan.name} renewal`, plan.price, method, member?.name),
        ],
      }));
      track('membership', `Subscription renewed — payment via ${method}.`);
      return { ok: true };
    },

    checkInMember({ memberId }) {
      const member = stateRef.current.members.find((item) => item.id === memberId);
      if (!member) return { ok: false, error: 'Member not found.' };
      const open = stateRef.current.checkIns.find((entry) => entry.memberId === memberId && !entry.outAt);
      if (open) return { ok: false, error: `${member.name} is already checked in.` };
      const entry: CheckIn = {
        id: newId('ci'),
        memberId,
        name: member.name,
        at: new Date().toISOString(),
        by: 'Front desk',
      };
      setState((current) => ({ ...current, checkIns: [entry, ...current.checkIns].slice(0, 2000) }));
      track('membership', `${member.name} checked in at the front desk.`, entry.id);
      return { ok: true };
    },

    endCheckIn(checkInId) {
      const entry = stateRef.current.checkIns.find((item) => item.id === checkInId);
      if (!entry) return { ok: false, error: 'Check-in not found.' };
      if (entry.outAt) return { ok: false, error: 'That visit is already closed.' };
      const outAt = new Date().toISOString();
      setState((current) => ({
        ...current,
        checkIns: current.checkIns.map((item) => (item.id === checkInId ? { ...item, outAt } : item)),
      }));
      track('membership', `${entry.name} checked out — visit closed.`, checkInId);
      return { ok: true };
    },

    // ------------------------------------------------------------- scanning --
    /**
     * Park a read in the scan log. Deliberately not an audit entry: a busy
     * counter scans hundreds of times a day and the audit trail is for things
     * that move money, stock or people. The *bill* a scan produces is audited by
     * `recordSale`; the *link* a scan creates is audited by `assignCode`.
     */
    recordScan({ code, source, context, outcome, symbology, productId, productName, quantity, by }) {
      const event: ScanEvent = {
        id: newId('scan'),
        code: normalizeCode(code),
        symbology: symbology ?? guessSymbology(code),
        source,
        context,
        outcome,
        productId,
        productName,
        quantity,
        at: new Date().toISOString(),
        by: by ?? 'Counter',
      };
      setState((current) => ({ ...current, scanEvents: [event, ...current.scanEvents].slice(0, 2000) }));
    },

    assignCode({ productId, code }) {
      const product = stateRef.current.products.find((item) => item.id === productId);
      if (!product) return { ok: false, error: 'Item not found.' };

      const clean = normalizeCode(code);
      if (!looksLikeCode(clean)) {
        return { ok: false, error: 'That does not look like a barcode. Scan it again, or type at least three characters.' };
      }
      const gtinShaped = [8, 12, 13, 14].includes(clean.length) && /^\d+$/.test(clean);
      if (gtinShaped && !isValidGtin(clean)) {
        return { ok: false, error: 'That is shaped like a retail barcode but its check digit does not match — usually a misread. Scan the label again.' };
      }

      const clash = stateRef.current.products.find(
        (item) =>
          item.id !== productId &&
          [item.barcode, item.internalCode].some(
            (existing) => existing && existing.trim().toUpperCase() === clean.toUpperCase(),
          ),
      );
      if (clash) {
        return {
          ok: false,
          error: `${clash.name} already carries ${clean}. Two items can never share a code — clear it there first, then link it here.`,
        };
      }

      // Codes DukaanOS minted live in the internal slot; anything read off a
      // printed label — GTIN or supplier Code 128 — belongs in the barcode slot,
      // because that is the one a scanner fills.
      const slot: 'barcode' | 'internalCode' = /^DK\d{9}$/.test(clean) ? 'internalCode' : 'barcode';
      setState((current) => ({
        ...current,
        products: current.products.map((item) =>
          item.id === productId ? { ...item, [slot]: clean } : item,
        ),
      }));
      track(
        'product',
        `${slot === 'barcode' ? 'Barcode' : 'Internal code'} ${clean} ${product.barcode || product.internalCode ? 'replaced' : 'linked'} on "${product.name}" — the counter can scan it from now on.`,
        productId,
      );
      return { ok: true };
    },

    mintInternalCode(productId) {
      const product = stateRef.current.products.find((item) => item.id === productId);
      if (!product) return { ok: false, error: 'Item not found.' };

      const taken = new Set(
        stateRef.current.products
          .flatMap((item) => [item.barcode, item.internalCode])
          .filter((value): value is string => Boolean(value))
          .map((value) => value.toUpperCase()),
      );
      let sequence = Math.max(stateRef.current.products.length, 1);
      let code = buildInternalCode(sequence);
      while (taken.has(code) && sequence < 99_999_999) {
        sequence += 1;
        code = buildInternalCode(sequence);
      }
      if (taken.has(code)) return { ok: false, error: 'All internal codes are in use. This catalogue has outgrown eight digits.' };

      const scaleNumber = /^DK(\d{8})\d$/.exec(code)?.[1];
      setState((current) => ({
        ...current,
        products: current.products.map((item) =>
          item.id === productId
            ? {
                ...item,
                internalCode: code,
                // A loose item needs a short counter number for weigh-scale labels.
                scaleNumber: item.scaleNumber ?? (scaleNumber ? Number(scaleNumber) % 99_999 : undefined),
              }
            : item,
        ),
      }));
      track('product', `Internal code ${code} minted for "${product.name}" — print it once and the counter can scan it.`, productId);
      return { ok: true, productId };
    },

    createProductFromScan({ code, name, category, itemType, sellingPrice, cost, stock, reorderLevel, unit, taxRate, looseMode }) {
      if (!name.trim()) return { ok: false, error: 'Give the item a name first — the code alone cannot be billed.' };
      if (sellingPrice < 0 || cost < 0 || stock < 0) return { ok: false, error: 'Prices and stock cannot be negative.' };

      const clean = normalizeCode(code);
      if (!looksLikeCode(clean)) return { ok: false, error: 'That does not look like a code. Scan the label again.' };
      const gtinShaped = [8, 12, 13, 14].includes(clean.length) && /^\d+$/.test(clean);
      if (gtinShaped && !isValidGtin(clean)) {
        return { ok: false, error: 'That code is shaped like a retail barcode but its check digit does not match — check the label before saving it.' };
      }

      const clash = stateRef.current.products.find((item) =>
        [item.barcode, item.internalCode].some((existing) => existing && existing.trim().toUpperCase() === clean.toUpperCase()),
      );
      if (clash) return { ok: false, error: `${clash.name} already carries ${clean}. Link the code there instead of creating a second item.` };

      const productId = newId('p');
      const slot: 'barcode' | 'internalCode' = /^DK\d{9}$/.test(clean) ? 'internalCode' : 'barcode';
      const product: Product = {
        id: productId,
        name: name.trim(),
        category: category.trim() || 'General',
        itemType,
        sellingPrice,
        cost,
        stock: itemType === 'service' ? 0 : stock,
        reorderLevel: itemType === 'service' ? 0 : reorderLevel,
        status: 'Active',
        taxRate,
        unit: unit?.trim() || undefined,
        looseMode: itemType === 'service' ? undefined : looseMode ?? 'none',
        ...(slot === 'barcode' ? { barcode: clean } : { internalCode: clean }),
      };
      setState((current) => ({
        ...current,
        products: [...current.products, product],
        // A brand-new item still starts its ledger: the opening count is the
        // first movement, so the shelf is never a number without a reason.
        stockMovements: pushMovements(current.stockMovements, [
          buildMovement({
            id: newId('mv'),
            productId,
            productName: product.name,
            at: new Date().toISOString(),
            reason: 'opening',
            delta: product.stock,
            balanceBefore: 0,
            note: `New item created from scanned code ${clean} — opening count ${product.stock}`,
            reference: clean,
            unit: unitFor(product.itemType, product.unit),
          }),
        ]),
      }));
      track(
        'product',
        `Item "${product.name}" created from a scanned code (${clean}) — it is billable at the counter immediately.`,
        productId,
      );
      return { ok: true, productId };
    },

    recordStockInward({ lines, supplier }) {
      const valid = lines.filter((line) => line.quantity > 0);
      if (valid.length === 0) return { ok: false, error: 'Scan at least one item to receive.' };

      for (const line of valid) {
        const product = stateRef.current.products.find((item) => item.id === line.productId);
        if (!product) return { ok: false, error: 'An item in this delivery is not in the catalogue any more.' };
        if (product.itemType === 'service') return { ok: false, error: `${product.name} is a service — it has no stock to receive.` };
        if (line.cost !== undefined && (line.cost < 0 || !Number.isFinite(line.cost))) {
          return { ok: false, error: 'Purchase price cannot be negative.' };
        }
      }

      const date = todayISO();
      const at = new Date().toISOString();
      const received = valid.map((line) => {
        const product = stateRef.current.products.find((item) => item.id === line.productId)!;
        const cost = line.cost ?? product.cost;
        return { line, product, cost, value: line.quantity * cost };
      });
      const totalValue = received.reduce((sum, entry) => sum + entry.value, 0);

      setState((current) => ({
        ...current,
        stockMovements: pushMovements(
          current.stockMovements,
          received.map((entry) => {
            const product = current.products.find((item) => item.id === entry.product.id);
            if (!product) return null;
            return buildMovement({
              id: newId('mv'),
              productId: product.id,
              productName: product.name,
              at,
              reason: 'goods-inward',
              delta: entry.line.quantity,
              balanceBefore: product.stock,
              note: `Goods received${supplier ? ` from ${supplier}` : ''} — ${entry.line.quantity} × ${product.name} at ${formatAuditAmount(entry.cost)}`,
              reference: supplier,
              unit: unitFor(product.itemType, product.unit),
            });
          }),
        ),
        products: current.products.map((product) => {
          const entry = received.find((item) => item.product.id === product.id);
          if (!entry) return product;
          return {
            ...product,
            stock: product.stock + entry.line.quantity,
            // A delivery at a new purchase price updates cost — audited below.
            cost: entry.cost,
          };
        }),
        transactions: [
          ...current.transactions,
          ...received.map((entry) => ({
            id: newId('t'),
            type: 'stock_adjustment' as const,
            description: `Goods received — ${entry.product.name}${supplier ? ` (${supplier})` : ''}`,
            amount: entry.value,
            direction: 'in' as const,
            account: 'inventory' as const,
            date,
          })),
        ],
      }));

      const repriced = received.filter((entry) => entry.cost !== entry.product.cost);
      track(
        'product',
        `Goods inward — ${valid.length} item(s) added to stock${supplier ? ` from ${supplier}` : ''}, ${formatAuditAmount(totalValue)} at purchase cost${
          repriced.length > 0 ? `. Cost price updated on ${repriced.map((entry) => entry.product.name).join(', ')}` : ''
        }.`,
      );
      return { ok: true };
    },

    // -------------------------------------------------- fingerprint check-in --
    enrollBiometric({ memberId, credentialId, label }) {
      const member = stateRef.current.members.find((item) => item.id === memberId);
      if (!member) return { ok: false, error: 'Choose a member to enrol first.' };
      if (!credentialId) return { ok: false, error: 'The reader did not return a credential — try again.' };
      const duplicate = stateRef.current.biometricCredentials.find(
        (item) => item.credentialId === credentialId && item.memberId === memberId,
      );
      if (duplicate) return { ok: false, error: `${member.name} is already enrolled on this device.` };

      const credential: BiometricCredential = {
        id: newId('bio'),
        memberId,
        memberName: member.name,
        credentialId,
        attachment: 'platform',
        label: label.trim() || 'This device',
        createdAt: new Date().toISOString(),
        useCount: 0,
      };
      setState((current) => ({
        ...current,
        biometricCredentials: [credential, ...current.biometricCredentials].slice(0, 2000),
      }));
      track(
        'membership',
        `${member.name} enrolled a fingerprint on ${credential.label}. Only a credential id was stored — the finger itself never left the device.`,
        credential.id,
      );
      return { ok: true };
    },

    revokeBiometric(credentialId) {
      const credential = stateRef.current.biometricCredentials.find((item) => item.credentialId === credentialId);
      if (!credential) return { ok: false, error: 'That enrolment is not on file.' };
      setState((current) => ({
        ...current,
        biometricCredentials: current.biometricCredentials.filter((item) => item.credentialId !== credentialId),
      }));
      track('membership', `${credential.memberName}'s fingerprint enrolment was removed. Nothing biometric was ever stored to delete.`, credential.id);
      return { ok: true };
    },

    checkInWithBiometric({ credentialId }) {
      const credential = stateRef.current.biometricCredentials.find((item) => item.credentialId === credentialId);
      if (!credential) {
        return { ok: false, error: 'That finger is not enrolled on this device. Enrol it once at the front desk.' };
      }
      const member = stateRef.current.members.find((item) => item.id === credential.memberId);
      if (!member) return { ok: false, error: 'This enrolment belongs to a member who is no longer on file.' };
      const open = stateRef.current.checkIns.find((entry) => entry.memberId === member.id && !entry.outAt);
      if (open) return { ok: false, error: `${member.name} is already checked in.` };

      const at = new Date().toISOString();
      const entry: CheckIn = {
        id: newId('ci'),
        memberId: member.id,
        name: member.name,
        at,
        by: 'Fingerprint · front desk',
      };
      setState((current) => ({
        ...current,
        checkIns: [entry, ...current.checkIns].slice(0, 2000),
        biometricCredentials: current.biometricCredentials.map((item) =>
          item.credentialId === credentialId
            ? { ...item, lastUsedAt: at, useCount: item.useCount + 1 }
            : item,
        ),
      }));
      track('membership', `${member.name} checked in with a fingerprint at the front desk.`, entry.id);
      return { ok: true };
    },

    addAppointment({ customerName, phone, service, staff, startAt, minutes, amount, notes }) {
      if (!customerName.trim()) return { ok: false, error: 'A name is required for the booking.' };
      if (!startAt) return { ok: false, error: 'Pick a date and time.' };
      const parsed = new Date(startAt);
      if (Number.isNaN(parsed.getTime())) return { ok: false, error: 'That date and time could not be read.' };
      if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
        return { ok: false, error: 'Amount cannot be negative.' };
      }
      const appointment: Appointment = {
        id: newId('apt'),
        customerName: customerName.trim(),
        phone: phone?.trim() || undefined,
        service: service?.trim() || undefined,
        staff: staff?.trim() || undefined,
        startAt: parsed.toISOString(),
        minutes: minutes && minutes > 0 ? Math.min(Math.round(minutes), 720) : 30,
        status: 'booked',
        amount: amount ?? 0,
        notes: notes?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      setState((current) => ({
        ...current,
        appointments: [...current.appointments, appointment].sort((a, b) => a.startAt.localeCompare(b.startAt)),
      }));
      track('system', `Booking added for ${appointment.customerName} — ${parsed.toLocaleString(getActiveFormattingLocale(), { dateStyle: 'medium', timeStyle: 'short' })}.`, appointment.id);
      return { ok: true };
    },

    setAppointmentStatus(appointmentId, status) {
      const appointment = stateRef.current.appointments.find((item) => item.id === appointmentId);
      if (!appointment) return { ok: false, error: 'Booking not found.' };
      if (appointment.status === status) return { ok: true };

      // Completing a booking with a value is a real sale — recorded once, and
      // only when it moves into `done`, so revenue can never double-count.
      const becomesRevenue = status === 'done' && appointment.status !== 'done' && (appointment.amount ?? 0) > 0;
      const date = todayISO();
      setState((current) => ({
        ...current,
        appointments: current.appointments.map((item) => (item.id === appointmentId ? { ...item, status } : item)),
        ...(becomesRevenue
          ? {
              transactions: [
                ...current.transactions,
                ...buildRevenueTransactions(
                  `${appointment.service ?? 'Service'} — ${appointment.customerName}`,
                  appointment.amount ?? 0,
                  'Cash',
                  appointment.staff,
                ).map((tx) => ({ ...tx, date })),
              ],
            }
          : {}),
      }));
      if (becomesRevenue) {
        track('sale', `Booking completed for ${appointment.customerName} — ${formatAuditAmount(appointment.amount ?? 0)} recorded as revenue.`, appointmentId);
      } else {
        track('system', `Booking for ${appointment.customerName} marked ${status}.`, appointmentId);
      }
      return { ok: true };
    },

    createInvoice({ customerName, customerPhone, lines, method, taxRate }) {
      if (!customerName.trim()) return { ok: false, error: 'Customer name is required.' };
      const validLines = lines.filter((line) => line.name.trim() && line.quantity > 0 && line.unitPrice >= 0);
      if (validLines.length === 0) return { ok: false, error: 'Add at least one invoice line.' };
      const subtotal = validLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
      if (subtotal <= 0) return { ok: false, error: 'Invoice total must be greater than zero.' };
      const tax = Math.round(subtotal * (taxRate / 100));
      const items: InvoiceItem[] = validLines.map((line) => ({
        id: newId('it'),
        name: line.name.trim(),
        category: line.category.trim() || 'General',
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        total: line.quantity * line.unitPrice,
      }));
      setState((current) => ({
        ...current,
        invoices: [
          ...current.invoices,
          {
            id: `INV-${1000 + current.invoices.length + 1}`,
            businessId: 'biz-1',
            customerName: customerName.trim(),
            customerPhone: customerPhone?.trim() || undefined,
            createdAt: new Date().toISOString(),
            paymentMethod: method,
            paymentStatus: 'pending',
            receiptMode: 'both',
            items,
            subtotal,
            tax,
            totalAmount: subtotal + tax,
            notes: 'Created from the billing console',
          },
        ],
      }));
      track('invoice', `Invoice raised for ${customerName.trim()} (${lines.length} line(s)).`);
      return { ok: true };
    },

    markInvoicePaid(invoiceId, method) {
      const invoice = stateRef.current.invoices.find((item) => item.id === invoiceId);
      if (!invoice) return { ok: false, error: 'Invoice not found.' };
      if (invoice.paymentStatus === 'paid') return { ok: false, error: 'Invoice is already paid.' };
      // The method the money actually arrived by wins over whatever the
      // invoice was raised with — the desk knows, the paper only guessed.
      const settledMethod = method ?? invoice.paymentMethod;
      const metered = meterCollection(settledMethod, stateRef.current.transactions, stateRef.current.profile.timezone);
      if (!metered.ok) return metered;
      const date = todayISO();
      setState((current) => ({
        ...current,
        invoices: current.invoices.map((item) => (item.id === invoiceId ? { ...item, paymentStatus: 'paid', paymentMethod: settledMethod } : item)),
        paymentRecords: [
          ...current.paymentRecords,
          {
            id: newId('pay'),
            businessId: invoice.businessId,
            invoiceId,
            customerName: invoice.customerName,
            amount: invoice.totalAmount,
            paymentMethod: settledMethod,
            status: 'paid',
            paymentDate: new Date().toISOString(),
            gateway: methodGateway(settledMethod),
          },
        ],
        transactions: [
          ...current.transactions,
          ...buildRevenueTransactions(`Invoice ${invoice.id}`, invoice.totalAmount, settledMethod, invoice.customerName).map((tx) => ({ ...tx, date })),
        ],
      }));
      track('invoice', `Invoice ${invoiceId} settled via ${settledMethod} — revenue and cash updated.`, invoiceId);
      return { ok: true };
    },

    setActiveRole(role) {
      if (role !== 'owner' && role !== 'manager' && role !== 'desk') {
        return { ok: false, error: 'Unknown role.' };
      }
      const label = role === 'owner' ? 'Owner' : role === 'manager' ? 'Manager' : 'Front desk';
      setState((current) => ({
        ...current,
        settings: { ...current.settings, activeRole: role, updatedAt: new Date().toISOString() },
      }));
      track('settings', `Console handed to the ${label} — settings changes now follow the ${label.toLowerCase()} rules.`);
      return { ok: true };
    },

    updateSettings(patch) {
      if (patch.taxRate !== undefined) {
        if (!Number.isFinite(patch.taxRate) || patch.taxRate < 0 || patch.taxRate > 100) {
          return { ok: false, error: 'Tax rate must be between 0 and 100.' };
        }
      }
      setState((current) => ({
        ...current,
        settings: { ...current.settings, ...patch, updatedAt: new Date().toISOString() },
      }));
      track('settings', 'Business settings updated.');
      return { ok: true };
    },

    updateProduct(productId, patch) {
      if (patch.sellingPrice !== undefined && (patch.sellingPrice < 0 || !Number.isFinite(patch.sellingPrice))) {
        return { ok: false, error: 'Selling price cannot be negative.' };
      }
      if (patch.cost !== undefined && (patch.cost < 0 || !Number.isFinite(patch.cost))) {
        return { ok: false, error: 'Cost price cannot be negative.' };
      }
      if (patch.stock !== undefined && (patch.stock < 0 || !Number.isFinite(patch.stock))) {
        return { ok: false, error: 'Stock cannot be negative.' };
      }
      let corrected: StockMovement | null = null;
      setState((current) => {
        const before = current.products.find((product) => product.id === productId);
        // A hand-typed stock figure is a *correction*, and the ledger says so:
        // how much was on the shelf, what the owner counted, and the difference.
        if (before && patch.stock !== undefined && before.itemType === 'product' && patch.stock !== before.stock) {
          corrected = buildMovement({
            id: newId('mv'),
            productId,
            productName: before.name,
            at: new Date().toISOString(),
            reason: 'count',
            delta: patch.stock - before.stock,
            balanceBefore: before.stock,
            note: `Shelf re-counted — figure corrected from ${before.stock} to ${patch.stock}${patch.stock < before.stock ? ' (shortage: damage, breakage or a miscount)' : ''}`,
            reference: 'Owner correction',
            unit: unitFor(before.itemType, before.unit),
          });
        }
        return {
          ...current,
          products: current.products.map((product) =>
            product.id === productId ? { ...product, ...patch, id: productId } : product,
          ),
          stockMovements: pushMovements(current.stockMovements, [corrected]),
        };
      });
      track(
        'product',
        corrected
          ? `Stock corrected for ${(corrected as StockMovement).productName} — ${describeStockChange(corrected as StockMovement)}.`
          : 'Product details updated (price/cost/stock/status changes are audited).',
        productId,
      );
      return { ok: true };
    },

    addCampaign({ name, channel, spend, notes }) {
      if (!name.trim()) return { ok: false, error: 'Campaign name is required.' };
      if (!Number.isFinite(spend) || spend < 0) return { ok: false, error: 'Spend cannot be negative.' };
      const campaign: MarketingCampaign = {
        id: newId('camp'),
        name: name.trim(),
        channel,
        spend,
        notes: notes?.trim() || undefined,
        startDate: todayISO(),
      };
      setState((current) => ({ ...current, campaigns: [campaign, ...current.campaigns] }));
      if (spend > 0) {
        // Marketing spend is also a real business expense paid out.
        setState((current) => ({
          ...current,
          transactions: [
            ...current.transactions,
            { id: newId('t'), type: 'expense', description: `Marketing expense — ${name.trim()}`, amount: spend, direction: 'out', account: 'expense', paymentMethod: 'UPI', date: todayISO() },
            { id: newId('t'), type: 'payment', description: `UPI paid for marketing — ${name.trim()}`, amount: spend, direction: 'out', account: 'upi', paymentMethod: 'UPI', date: todayISO() },
          ],
        }));
      }
      track('marketing', `Marketing campaign \"${name.trim()}\" recorded (${channel}, spend ${formatAuditAmount(spend)}).`, campaign.id);
      return { ok: true };
    },

    updateProfile(patch) {
      if (patch.name !== undefined && !patch.name.trim()) return { ok: false, error: 'Business name is required.' };
      if (patch.upiId && !isValidUpiId(patch.upiId)) {
        return { ok: false, error: 'Enter a valid UPI ID (e.g. businessname@bank).' };
      }
      if (patch.bank?.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(patch.bank.ifsc.toUpperCase().trim())) {
        return { ok: false, error: 'Enter a valid IFSC code (e.g. HDFC0001234).' };
      }
      setState((current) => ({
        ...current,
        profile: {
          ...current.profile,
          ...patch,
          ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        },
      }));
      return { ok: true };
    },

    applyTemplate(templateId) {
      const template = businessTemplates.find((t) => t.id === templateId);
      if (!template) return { ok: false, error: 'Unknown business template.' };
      const preset = presetForPortal(templateId);
      setState((current) => ({
        ...current,
        profile: { ...current.profile, templateId },
        settings: { ...current.settings, ...preset },
      }));
      track('settings', `Applied the "${template.name}" business template — modules configured for ${template.category} operations.`);
      return { ok: true };
    },

    loadDemoBusiness() {
      setState(buildSeedState());
    },

    startFreshBusiness() {
      setState(buildEmptyState());
      track('system', 'Started a fresh business — every balance reset to ₹0.');
    },

    resetDemo() {
      try {
        // Clear both the encrypted vault slot and any legacy plaintext key.
        vaultClear(STORAGE_KEY);
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore storage errors; state is reset in memory either way.
      }
      setState(buildSeedState());
    },

    async syncNow() {
      if (!syncingEnabled) return;
      setSyncStatus('syncing');
      try {
        const result = await pushStateToSupabase(stateRef.current);
        setSyncStatus(result.ok ? 'synced' : 'error');
      } catch {
        setSyncStatus('error');
      }
    },
    });
  }, [syncingEnabled]);

  const stateValue = useMemo(
    () => ({ state, hydrated, syncStatus, persistence }),
    [state, hydrated, syncStatus, persistence],
  );

  return (
    <StoreStateContext.Provider value={stateValue}>
      <StoreActionsContext.Provider value={actions}>{children}</StoreActionsContext.Provider>
    </StoreStateContext.Provider>
  );
}

/** Full accessor — state, actions, and status. */
export function useDukaanStore(): StoreContextValue {
  const stateContext = useContext(StoreStateContext);
  const actions = useContext(StoreActionsContext);
  if (!stateContext || !actions) {
    throw new Error('useDukaanStore must be used inside DukaanStoreProvider');
  }
  return { ...stateContext, actions };
}

/**
 * Actions only. Use this in components that dispatch but do not display
 * business data — they stay still while the ledger changes underneath.
 */
export function useDukaanActions(): StoreActions {
  const actions = useContext(StoreActionsContext);
  if (!actions) {
    throw new Error('useDukaanActions must be used inside DukaanStoreProvider');
  }
  return actions;
}

/** Read only the slice a component actually needs. */
export function useDukaanSelector<T>(select: (state: StoreState) => T): T {
  const { state } = useDukaanStore();
  return useMemo(() => select(state), [state, select]);
}

/** Convenience selector: the financial snapshot recomputed from live transactions. */
export function useFinancialSnapshot() {
  const { state } = useDukaanStore();
  return useMemo(() => summarizeFinancials(state.transactions), [state.transactions]);
}
