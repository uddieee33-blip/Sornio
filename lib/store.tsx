'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  demoCustomers,
  demoProducts,
  summarizeFinancials,
  type Product,
  type Transaction,
} from '@/lib/business-data';
import { isValidUpiId, normalizeUpiId, type BankDetails } from '@/lib/upi';
import { businessTemplates, defaultBusinessSettings, type BusinessSettings } from '@/lib/models/business';
import { currentSyncMode } from '@/lib/supabase/config';
import { pushStateToSupabase, type SyncStatus } from '@/lib/sync/supabase-sync';
import { GENESIS_HASH, appendAuditEntry, isChained, type AuditActor, type AuditSeverity } from '@/lib/security/audit';
import { vaultClear, vaultRead, vaultWrite } from '@/lib/security/vault';
import { debounce } from '@/lib/perf/idle';
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

/** How each business-type template configures the operating modules. */
const TEMPLATE_PRESETS: Record<string, Partial<BusinessSettings>> = {
  'template-gym': { allowMemberships: true, allowInventory: false, allowAppointments: false, receiptMode: 'both', sendSmsReminders: true, sendWhatsappReminders: true },
  'template-cafe': { allowMemberships: true, allowInventory: true, allowAppointments: false, receiptMode: 'both', sendSmsReminders: false, sendWhatsappReminders: true },
  'template-grocery': { allowMemberships: false, allowInventory: true, allowAppointments: false, receiptMode: 'physical', sendSmsReminders: false, sendWhatsappReminders: false },
  'template-salon': { allowMemberships: true, allowInventory: false, allowAppointments: true, receiptMode: 'both', sendSmsReminders: true, sendWhatsappReminders: true },
  'template-electronics': { allowMemberships: false, allowInventory: true, allowAppointments: false, receiptMode: 'digital', sendSmsReminders: false, sendWhatsappReminders: false },
};


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
  settings: BusinessSettings;
  audit: AuditEntry[];
  campaigns: MarketingCampaign[];
};

export type ActionResult = { ok: boolean; error?: string };

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
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
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
  recordSale: (input: { lines: SaleLine[]; method: PaymentMethod; customerName?: string }) => ActionResult;
  recordExpense: (input: { category: string; amount: number; method: PaymentMethod }) => ActionResult;
  addCustomer: (input: { name: string; phone?: string; email?: string; details?: string; bank?: BankDetails }) => ActionResult;
  updateCustomer: (customerId: string, patch: Partial<Pick<Customer, 'name' | 'phone' | 'email' | 'details' | 'bank' | 'openingBalance'>>) => ActionResult;
  addPlan: (input: { name: string; type: MembershipPlan['type']; durationMonths: number; price: number; description?: string }) => ActionResult;
  addMember: (input: { name: string; phone: string; preferredChannel: Member['preferredChannel'] }) => ActionResult;
  enrollMember: (input: { memberId: string; planId: string; method: PaymentMethod }) => ActionResult;
  renewSubscription: (input: { subscriptionId: string; method: PaymentMethod }) => ActionResult;
  createInvoice: (input: { customerName: string; customerPhone?: string; lines: InvoiceLine[]; method: PaymentMethod; taxRate: number }) => ActionResult;
  markInvoicePaid: (invoiceId: string) => ActionResult;
  updateProduct: (productId: string, patch: Partial<Omit<Product, 'id'>>) => ActionResult;
  addCampaign: (input: { name: string; channel: MarketingCampaign['channel']; spend: number; notes?: string }) => ActionResult;
  updateProfile: (patch: Partial<BusinessProfile>) => ActionResult;
  applyTemplate: (templateId: string) => ActionResult;
  loadDemoBusiness: () => void;
  startFreshBusiness: () => void;
  syncNow: () => Promise<void>;
  updateSettings: (patch: Partial<BusinessSettings>) => ActionResult;
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
      settings: parsed.settings ?? defaultBusinessSettings,
      audit: Array.isArray(parsed.audit) ? parsed.audit : [],
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      products: Array.isArray(parsed.products) ? parsed.products : [],
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
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
      setState((current) => ({
        ...current,
        products: [...current.products, { ...input, id: newId('p'), name: input.name.trim() }],
      }));
      track('product', `Product \"${input.name.trim()}\" added to the catalog.`);
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

    recordSale({ lines, method, customerName }) {
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

      const date = todayISO();
      const label = customerName?.trim() || undefined;

      setState((current) => {
        const newTransactions: Transaction[] = buildRevenueTransactions(
          `Sale of ${validLines.length} item(s)`,
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

        return {
          ...current,
          transactions: [...current.transactions, ...newTransactions],
          products: current.products.map((product) => {
            const line = validLines.find((entry) => entry.productId === product.id);
            if (!line || product.itemType !== 'product') return product;
            return { ...product, stock: Math.max(product.stock - line.quantity, 0) };
          }),
        };
      });
      track('sale', `Sale of ${formatAuditAmount(total)} recorded via ${method}${label ? ` for ${label}` : ''}.`);
      return { ok: true };
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

    markInvoicePaid(invoiceId) {
      const invoice = stateRef.current.invoices.find((item) => item.id === invoiceId);
      if (!invoice) return { ok: false, error: 'Invoice not found.' };
      if (invoice.paymentStatus === 'paid') return { ok: false, error: 'Invoice is already paid.' };
      const date = todayISO();
      setState((current) => ({
        ...current,
        invoices: current.invoices.map((item) => (item.id === invoiceId ? { ...item, paymentStatus: 'paid' } : item)),
        paymentRecords: [
          ...current.paymentRecords,
          {
            id: newId('pay'),
            businessId: invoice.businessId,
            invoiceId,
            customerName: invoice.customerName,
            amount: invoice.totalAmount,
            paymentMethod: invoice.paymentMethod,
            status: 'paid',
            paymentDate: new Date().toISOString(),
            gateway: methodGateway(invoice.paymentMethod),
          },
        ],
        transactions: [
          ...current.transactions,
          ...buildRevenueTransactions(`Invoice ${invoice.id}`, invoice.totalAmount, invoice.paymentMethod, invoice.customerName).map((tx) => ({ ...tx, date })),
        ],
      }));
      track('invoice', `Invoice ${invoiceId} marked paid — revenue and cash updated.`, invoiceId);
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
      setState((current) => ({
        ...current,
        products: current.products.map((product) =>
          product.id === productId ? { ...product, ...patch, id: productId } : product,
        ),
      }));
      track('product', 'Product details updated (price/cost/stock/status changes are audited).', productId);
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
      const preset = TEMPLATE_PRESETS[templateId] ?? {};
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
