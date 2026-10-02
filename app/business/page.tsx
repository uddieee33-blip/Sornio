export type Product = {
  id: string;
  name: string;
  category: string;
  itemType: 'product' | 'service';
  sellingPrice: number;
  cost: number;
  stock: number;
  reorderLevel: number;
  status: 'Active' | 'Inactive';
  supplier?: string;
};

export type Transaction = {
  id: string;
  type: 'sale' | 'expense' | 'payment' | 'stock_adjustment' | 'refund' | 'transfer';
  description: string;
  amount: number;
  direction: 'in' | 'out';
  account: 'cash' | 'bank' | 'upi' | 'card' | 'receivables' | 'payables' | 'revenue' | 'expense' | 'inventory';
  paymentMethod?: 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Other';
  date: string;
};

export const emptyTransactions: Transaction[] = [];

export const demoProducts: Product[] = [
  { id: 'p1', name: 'Organic Soap', category: 'Personal Care', itemType: 'product', sellingPrice: 280, cost: 130, stock: 18, reorderLevel: 8, status: 'Active', supplier: 'Urban Goods Co.' },
  { id: 'p2', name: 'Signature Tea', category: 'Food', itemType: 'product', sellingPrice: 120, cost: 56, stock: 32, reorderLevel: 10, status: 'Active', supplier: 'Fresh Harvest' },
  { id: 'p3', name: 'Web Design Package', category: 'Services', itemType: 'service', sellingPrice: 15000, cost: 6500, stock: 0, reorderLevel: 0, status: 'Active', supplier: 'Creative Studio' },
  { id: 'p4', name: 'Bamboo Mug', category: 'Home', itemType: 'product', sellingPrice: 499, cost: 260, stock: 12, reorderLevel: 15, status: 'Inactive', supplier: 'Daily Needs Supply' },
];

export const demoTransactions: Transaction[] = [
  { id: 't1', type: 'sale', description: 'Retail sale - Organic Soap', amount: 125000, direction: 'in', account: 'revenue', paymentMethod: 'Cash', date: '2026-10-02' },
  { id: 't2', type: 'sale', description: 'Retail sale - Signature Tea', amount: 35000, direction: 'in', account: 'revenue', paymentMethod: 'UPI', date: '2026-10-02' },
  { id: 't3', type: 'expense', description: 'Rent payment', amount: 28000, direction: 'out', account: 'expense', paymentMethod: 'Bank Transfer', date: '2026-10-02' },
  { id: 't4', type: 'expense', description: 'Electricity bill', amount: 4200, direction: 'out', account: 'expense', paymentMethod: 'Cash', date: '2026-10-02' },
  { id: 't5', type: 'payment', description: 'Cash collection', amount: 30000, direction: 'in', account: 'cash', paymentMethod: 'Cash', date: '2026-10-02' },
  { id: 't6', type: 'payment', description: 'UPI settlement', amount: 12000, direction: 'in', account: 'upi', paymentMethod: 'UPI', date: '2026-10-02' },
  { id: 't7', type: 'stock_adjustment', description: 'Inventory reduction due to sale', amount: 6000, direction: 'out', account: 'inventory', date: '2026-10-02' },
  { id: 't8', type: 'refund', description: 'Customer refund issued', amount: 4500, direction: 'out', account: 'revenue', date: '2026-10-02' },
  { id: 't9', type: 'transfer', description: 'Cash to bank transfer', amount: 15000, direction: 'out', account: 'bank', date: '2026-10-02' },
];

export const demoCustomers = [
  { name: 'Riya Sharma', balance: 12500, sales: 3, status: 'Outstanding' },
  { name: 'Amit Verma', balance: 7800, sales: 2, status: 'Partial' },
  { name: 'Nisha Patel', balance: 0, sales: 5, status: 'Paid' },
];

export const demoSuppliers = [
  { name: 'Urban Goods Co.', payable: 18000, orders: 4 },
  { name: 'Fresh Harvest', payable: 6500, orders: 2 },
  { name: 'Daily Needs Supply', payable: 0, orders: 1 },
];

export type BusinessSnapshot = {
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  operatingExpenses: number;
  operatingProfit: number;
  netProfit: number;
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
  cashBalance: number;
  bankBalance: number;
  upiBalance: number;
  cardReceivables: number;
  inventoryValue: number;
  customerReceivables: number;
  payables: number;
};

export function summarizeFinancials(transactions: Transaction[]): BusinessSnapshot {
  const revenue = transactions
    .filter((t) => t.type === 'sale' && t.direction === 'in')
    .reduce((sum, t) => sum + t.amount, 0);

  const cogs = transactions
    .filter((t) => t.type === 'stock_adjustment' && t.direction === 'out')
    .reduce((sum, t) => sum + t.amount, 0);

  const operatingExpenses = transactions
    .filter((t) => t.type === 'expense' && t.direction === 'out')
    .reduce((sum, t) => sum + t.amount, 0);

  const refunds = transactions
    .filter((t) => t.type === 'refund' && t.direction === 'out')
    .reduce((sum, t) => sum + t.amount, 0);

  const netRevenue = revenue - refunds;
  const grossProfit = Math.max(netRevenue - cogs, 0);
  const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
  const operatingProfit = Math.max(grossProfit - operatingExpenses, 0);
  const netProfit = operatingProfit;

  const cashIn = transactions
    .filter((t) => t.direction === 'in' && ['cash', 'upi', 'bank', 'card'].includes(t.account))
    .reduce((sum, t) => sum + t.amount, 0);

  const cashOut = transactions
    .filter((t) => t.direction === 'out' && ['cash', 'upi', 'bank', 'card'].includes(t.account))
    .reduce((sum, t) => sum + t.amount, 0);

  const netCashFlow = cashIn - cashOut;
  const cashBalance = netCashFlow;

  const inventoryValue = Math.abs(
    transactions
      .filter((t) => t.type === 'stock_adjustment')
      .reduce((sum, t) => sum + (t.direction === 'out' ? -t.amount : t.amount), 0),
  );

  const bankBalance = transactions
    .filter((t) => t.account === 'bank' && t.direction === 'in')
    .reduce((sum, t) => sum + t.amount, 0);

  const upiBalance = transactions
    .filter((t) => t.account === 'upi' && t.direction === 'in')
    .reduce((sum, t) => sum + t.amount, 0);

  const cardReceivables = transactions
    .filter((t) => t.account === 'card' && t.direction === 'in')
    .reduce((sum, t) => sum + t.amount, 0);

  const customerReceivables = 0;
  const payables = 0;

  return {
    revenue: netRevenue,
    cogs,
    grossProfit,
    grossMargin,
    operatingExpenses,
    operatingProfit,
    netProfit,
    cashIn,
    cashOut,
    netCashFlow,
    cashBalance,
    bankBalance,
    upiBalance,
    cardReceivables,
    inventoryValue,
    customerReceivables,
    payables,
  } satisfies BusinessSnapshot;
}

export function getAlerts(snapshot: BusinessSnapshot, products: Product[]) {
  const alerts: { type: string; message: string; tone: 'amber' | 'red' | 'sky' }[] = [];

  const lowStockProducts = products.filter((p) => p.stock <= p.reorderLevel && p.status === 'Active');
  if (lowStockProducts.length > 0) {
    alerts.push({
      type: 'low-stock',
      message: `${lowStockProducts.length} item(s) are below their reorder level.`,
      tone: 'amber',
    });
  }

  if (snapshot.customerReceivables > 0) {
    alerts.push({
      type: 'receivables',
      message: `Outstanding customer balance of ${formatCurrency(snapshot.customerReceivables)} remains unpaid.`,
      tone: 'red',
    });
  }

  if (snapshot.payables > 0) {
    alerts.push({
      type: 'payables',
      message: `Supplier payables total ${formatCurrency(snapshot.payables)}.`,
      tone: 'sky',
    });
  }

  return alerts;
}

export function getInsights(snapshot: BusinessSnapshot) {
  return [
    `Revenue increased to ${formatCurrency(snapshot.revenue)} because sales were recorded in the current period.`,
    `Cash balance is ${formatCurrency(snapshot.cashBalance)} after recorded inflows and outflows.`,
    `Inventory decreased because stock was consumed through sales and stock adjustments.`,
    `Gross profit is ${formatCurrency(snapshot.grossProfit)} at ${snapshot.grossMargin.toFixed(1)}% margin.`,
  ];
}

export function getComparisonData(snapshot: BusinessSnapshot) {
  return [
    { label: 'Revenue', current: snapshot.revenue, previous: Math.max(snapshot.revenue * 0.82, 0) },
    { label: 'Gross Profit', current: snapshot.grossProfit, previous: Math.max(snapshot.grossProfit * 0.76, 0) },
    { label: 'Operating Expenses', current: snapshot.operatingExpenses, previous: Math.max(snapshot.operatingExpenses * 1.13, 0) },
    { label: 'Net Cash Flow', current: snapshot.netCashFlow, previous: Math.max(snapshot.netCashFlow * 0.91, 0) },
  ];
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

export const businessTemplates = [
  {
    id: 'grocery',
    name: 'Grocery Store',
    category: 'retail',
    description: 'Barcode scanning, stock management, purchase tracking, and customer receipts.',
    modules: ['Inventory', 'Barcode scanning', 'Suppliers', 'Billing', 'Loyalty'],
  },
  {
    id: 'salon',
    name: 'Salon & Spa',
    category: 'service',
    description: 'Service-based billing, appointments, memberships and reminder flows.',
    modules: ['Services', 'Appointments', 'Memberships', 'Receipts', 'Reminders'],
  },
  {
    id: 'gym',
    name: 'Gym & Fitness',
    category: 'fitness',
    description: 'Plans, renewals, workouts, attendance and customer renewal reminders.',
    modules: ['Memberships', 'SMS reminders', 'Renewals', 'Attendance', 'Billing'],
  },
  {
    id: 'cafe',
    name: 'Cafe & Restaurant',
    category: 'hospitality',
    description: 'Order systems, POS-style billing, digital receipts and menu management.',
    modules: ['Menu', 'Orders', 'Bills', 'Digital receipts', 'Loyalty'],
  },
  {
    id: 'electronics',
    name: 'Electronics Store',
    category: 'electronics',
    description: 'Brand catalog, model variants, warranty tracking and invoice generation.',
    modules: ['Catalog', 'Variants', 'Warranty', 'Billing', 'Reports'],
  },
];

export const membershipPlans = [
  { id: 'm1', name: 'Monthly Access', durationMonths: 1, price: 1999, type: 'monthly', isActive: true, description: 'Ideal for short-term commitments.' },
  { id: 'm2', name: 'Quarterly Plus', durationMonths: 3, price: 4999, type: 'quarterly', isActive: true, description: 'Best for steady members.' },
  { id: 'm3', name: 'Half Year Fitness', durationMonths: 6, price: 8999, type: 'half_yearly', isActive: true, description: 'Great for consistent training.' },
  { id: 'm4', name: 'Annual Elite', durationMonths: 12, price: 15999, type: 'annual', isActive: true, description: 'Best long-term value.' },
];

export const sampleInvoices = [
  {
    id: 'INV-1024',
    customerName: 'John Wilson',
    businessName: 'Cult Fitness',
    createdAt: '2026-10-02',
    amount: 4999,
    paymentMethod: 'UPI',
    receiptMode: 'both',
    status: 'paid',
    items: [
      { id: 'i1', name: 'Quarterly membership', unitPrice: 4999, quantity: 1, category: 'Membership' },
    ],
  },
  {
    id: 'INV-1025',
    customerName: 'Aisha Khan',
    businessName: 'Saffron Café',
    createdAt: '2026-10-02',
    amount: 1260,
    paymentMethod: 'Cash',
    receiptMode: 'physical',
    status: 'paid',
    items: [
      { id: 'i2', name: 'Cold Coffee', unitPrice: 260, quantity: 2, category: 'Beverages' },
      { id: 'i3', name: 'Veg Sandwich', unitPrice: 390, quantity: 1, category: 'Food' },
    ],
  },
];

export const reminderTemplates = [
  {
    id: 'r1',
    name: '3 day notice',
    channel: 'both',
    message: 'Hi {customerName}, your {businessName} membership is ending in 3 days. Renew now to stay on track and keep your momentum going.',
  },
  {
    id: 'r2',
    name: 'Expiry today',
    channel: 'sms',
    message: 'Hi {customerName}, your {businessName} membership expires today. Renew now to continue your journey.',
  },
];
