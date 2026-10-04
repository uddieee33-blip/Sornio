'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  demoCustomers,
  demoProducts,
  demoTransactions,
  summarizeFinancials,
  type Product,
  type Transaction,
} from '@/lib/business-data';
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
  openingBalance: number;
  createdAt: string;
};

export type StoreState = {
  products: Product[];
  transactions: Transaction[];
  customers: Customer[];
  plans: MembershipPlan[];
  members: Member[];
  subscriptions: MembershipSubscription[];
  reminderTemplates: ReminderTemplate[];
  invoices: Invoice[];
  paymentRecords: PaymentRecord[];
};

export type ActionResult = { ok: boolean; error?: string };

export type SaleLine = { productId: string; quantity: number; rate: number };
export type InvoiceLine = { name: string; category: string; quantity: number; unitPrice: number };

const STORAGE_KEY = 'dukaanos-store-v1';

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

export function buildSeedState(): StoreState {
  return {
    products: demoProducts,
    transactions: demoTransactions,
    customers: demoCustomers.map((customer, index) => ({
      id: `customer-${index + 1}`,
      name: customer.name,
      phone: ['+91 98111 22334', '+91 97222 33445', '+91 96333 44556'][index],
      openingBalance: customer.balance,
      createdAt: '2026-09-01T09:00:00.000Z',
    })),
    plans: defaultMembershipPlans,
    members: defaultMembers,
    subscriptions: buildSampleSubscriptions(),
    reminderTemplates: defaultReminderTemplates,
    invoices: sampleInvoices,
    paymentRecords: samplePaymentRecords,
  };
}

export type StoreActions = {
  addProduct: (input: Omit<Product, 'id'>) => ActionResult;
  toggleProductStatus: (productId: string) => void;
  recordSale: (input: { lines: SaleLine[]; method: PaymentMethod; customerName?: string }) => ActionResult;
  recordExpense: (input: { category: string; amount: number; method: PaymentMethod }) => ActionResult;
  addCustomer: (input: { name: string; phone?: string }) => ActionResult;
  addPlan: (input: { name: string; type: MembershipPlan['type']; durationMonths: number; price: number; description?: string }) => ActionResult;
  addMember: (input: { name: string; phone: string; preferredChannel: Member['preferredChannel'] }) => ActionResult;
  enrollMember: (input: { memberId: string; planId: string; method: PaymentMethod }) => ActionResult;
  renewSubscription: (input: { subscriptionId: string; method: PaymentMethod }) => ActionResult;
  createInvoice: (input: { customerName: string; customerPhone?: string; lines: InvoiceLine[]; method: PaymentMethod; taxRate: number }) => ActionResult;
  markInvoicePaid: (invoiceId: string) => ActionResult;
  resetDemo: () => void;
};

type StoreContextValue = {
  state: StoreState;
  actions: StoreActions;
  hydrated: boolean;
};

const StoreContext = createContext<StoreContextValue | null>(null);

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
  const [state, setState] = useState<StoreState>(buildSeedState);
  const [hydrated, setHydrated] = useState(false);

  // A ref that always mirrors the latest state so memoized actions read fresh data.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Hydrate from localStorage after mount so server and client first renders match.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoreState;
        if (parsed && Array.isArray(parsed.transactions) && Array.isArray(parsed.products)) {
          setState(parsed);
        }
      }
    } catch {
      // Corrupt storage falls back to the seeded demo business.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage may be unavailable (private mode); the session still works in memory.
    }
  }, [state, hydrated]);

  const actions = useMemo<StoreActions>(() => ({
    addProduct(input) {
      if (!input.name.trim()) return { ok: false, error: 'Item name is required.' };
      if (input.sellingPrice < 0 || input.cost < 0 || input.stock < 0) {
        return { ok: false, error: 'Prices and stock cannot be negative.' };
      }
      setState((current) => ({
        ...current,
        products: [...current.products, { ...input, id: newId('p'), name: input.name.trim() }],
      }));
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
      return { ok: true };
    },

    addCustomer({ name, phone }) {
      if (!name.trim()) return { ok: false, error: 'Customer name is required.' };
      setState((current) => ({
        ...current,
        customers: [
          ...current.customers,
          { id: newId('customer'), name: name.trim(), phone: phone?.trim() || undefined, openingBalance: 0, createdAt: new Date().toISOString() },
        ],
      }));
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
      return { ok: true };
    },

    resetDemo() {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore storage errors; state is reset in memory either way.
      }
      setState(buildSeedState());
    },
  }), []);

  return <StoreContext.Provider value={{ state, actions, hydrated }}>{children}</StoreContext.Provider>;
}

export function useDukaanStore(): StoreContextValue {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useDukaanStore must be used inside DukaanStoreProvider');
  }
  return context;
}

/** Convenience selector: the financial snapshot recomputed from live transactions. */
export function useFinancialSnapshot() {
  const { state } = useDukaanStore();
  return useMemo(() => summarizeFinancials(state.transactions), [state.transactions]);
}
