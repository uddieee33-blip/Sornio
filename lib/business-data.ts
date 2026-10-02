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

export function summarizeFinancials(transactions: Transaction[]) {
  const revenue = transactions
    .filter((t) => t.type === 'sale' && t.direction === 'in')
    .reduce((sum, t) => sum + t.amount, 0);

  const cogs = transactions
    .filter((t) => t.type === 'stock_adjustment' && t.direction === 'out')
    .reduce((sum, t) => sum + t.amount, 0);

  const operatingExpenses = transactions
    .filter((t) => t.type === 'expense' && t.direction === 'out')
    .reduce((sum, t) => sum + t.amount, 0);

  const grossProfit = Math.max(revenue - cogs, 0);
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const operatingProfit = Math.max(revenue - cogs - operatingExpenses, 0);
  const netProfit = Math.max(revenue - cogs - operatingExpenses - 4500, 0);

  const cashIn = transactions
    .filter((t) => t.direction === 'in' && ['cash', 'upi', 'bank', 'card'].includes(t.account))
    .reduce((sum, t) => sum + t.amount, 0);

  const cashOut = transactions
    .filter((t) => t.direction === 'out' && ['cash', 'upi', 'bank', 'card'].includes(t.account))
    .reduce((sum, t) => sum + t.amount, 0);

  const netCashFlow = cashIn - cashOut;
  const cashBalance = cashIn - cashOut;
  const inventoryValue = transactions
    .filter((t) => t.type === 'stock_adjustment')
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    revenue,
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
    bankBalance: 120000,
    upiBalance: 7000,
    cardReceivables: 9000,
    inventoryValue,
    customerReceivables: 23000,
    payables: 26000,
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
    `Revenue increased because recorded sales were posted in the current period.`,
    `Cash balance is ${formatCurrency(snapshot.cashBalance)} after recorded inflows and outflows.`,
    `Inventory decreased because stock was consumed through sales and stock adjustments.`,
    `Receivables increased because a sale was recorded as unpaid in the ledger.`,
  ];
}

export function getComparisonData(snapshot: BusinessSnapshot) {
  return [
    { label: 'Revenue', current: snapshot.revenue, previous: snapshot.revenue * 0.82 },
    { label: 'Gross Profit', current: snapshot.grossProfit, previous: snapshot.grossProfit * 0.76 },
    { label: 'Operating Expenses', current: snapshot.operatingExpenses, previous: snapshot.operatingExpenses * 1.13 },
    { label: 'Net Cash Flow', current: snapshot.netCashFlow, previous: snapshot.netCashFlow * 0.91 },
  ];
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}
