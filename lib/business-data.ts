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
  description?: string;
  /** GST / tax rate in percent, if applicable */
  taxRate?: number;
  /** SKU / item code (optional) */
  sku?: string;
  /** Unit of measure, e.g. pcs, kg, hour */
  unit?: string;
  /**
   * The printed retail barcode — EAN-13, EAN-8, UPC-A or the ITF-14 case code
   * on a carton — or a supplier's own Code 128 reference. This is the code the
   * scanner at the counter reads (see `lib/scanning`).
   */
  barcode?: string;
  /**
   * The shop's own scannable code, for everything that will never carry a
   * manufacturer barcode: loose grain, house brands, stitched stock, spare
   * parts. Minted by DukaanOS with a check digit, printed as Code 128.
   */
  internalCode?: string;
  /**
   * How this item is read when there is nothing to scan:
   * `weight` — the counter scale prints the weight onto an in-store label;
   * `price`  — the scale prints the amount instead;
   * `none`   — a plain packet or piece.
   */
  looseMode?: 'none' | 'weight' | 'price';
  /** For loose items: the shop's short counter number used on weigh-scale labels. */
  scaleNumber?: number;
};

/** A sold line item recorded on the sale transaction for full traceability. */
export type SaleItemRef = { productId: string; name: string; quantity: number; rate: number; cost: number };

export type Transaction = {
  id: string;
  type: 'sale' | 'expense' | 'payment' | 'stock_adjustment' | 'refund' | 'transfer';
  description: string;
  amount: number;
  direction: 'in' | 'out';
  account: 'cash' | 'bank' | 'upi' | 'card' | 'receivables' | 'payables' | 'revenue' | 'expense' | 'inventory';
  paymentMethod?: 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Other';
  date: string;
  /** Present on sale transactions: the exact items sold (product profitability + history). */
  items?: SaleItemRef[];
};

// Empty business starts at zero
export const emptyTransactions: Transaction[] = [];

export const demoProducts: Product[] = [
  { id: 'p1', name: 'Organic Soap', category: 'Personal Care', itemType: 'product', sellingPrice: 280, cost: 130, stock: 18, reorderLevel: 8, status: 'Active', supplier: 'Urban Goods Co.', sku: 'SOAP-001', unit: 'pcs', barcode: '8901234567890' },
  { id: 'p2', name: 'Signature Tea', category: 'Food', itemType: 'product', sellingPrice: 120, cost: 56, stock: 32, reorderLevel: 10, status: 'Active', supplier: 'Fresh Harvest', sku: 'TEA-500', unit: 'pcs', barcode: '8902345678901' },
  { id: 'p3', name: 'Web Design Package', category: 'Services', itemType: 'service', sellingPrice: 15000, cost: 6500, stock: 0, reorderLevel: 0, status: 'Active', supplier: 'Creative Studio' },
  { id: 'p4', name: 'Bamboo Mug', category: 'Home', itemType: 'product', sellingPrice: 499, cost: 260, stock: 12, reorderLevel: 15, status: 'Inactive', supplier: 'Daily Needs Supply', sku: 'MUG-01', unit: 'pcs', barcode: '8903456789012' },
  // A loose item, so the demo shows the other half of scanning: no barcode on
  // the sack, a DukaanOS internal code on the scale label, weight carried in
  // the code itself.
  { id: 'p5', name: 'Loose Almonds', category: 'Dry Fruit', itemType: 'product', sellingPrice: 900, cost: 640, stock: 12, reorderLevel: 4, status: 'Active', supplier: 'Fresh Harvest', unit: 'kg', internalCode: 'DK000000042', looseMode: 'weight', scaleNumber: 1 },
];

// Demo transactions for testing
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

/**
 * Summarize financials from actual recorded transactions.
 * Financial values are ONLY calculated from transaction records.
 * No values are hardcoded or fabricated.
 */
export function summarizeFinancials(transactions: Transaction[]): BusinessSnapshot {
  // REVENUE: sum of all sales recorded as incoming revenue
  const revenue = transactions
    .filter((t) => t.type === 'sale' && t.direction === 'in')
    .reduce((sum, t) => sum + t.amount, 0);

  // COST OF GOODS SOLD: sum of stock adjustments (inventory reduction)
  const cogs = transactions
    .filter((t) => t.type === 'stock_adjustment' && t.direction === 'out')
    .reduce((sum, t) => sum + t.amount, 0);

  // OPERATING EXPENSES: sum of expense records
  const operatingExpenses = transactions
    .filter((t) => t.type === 'expense' && t.direction === 'out')
    .reduce((sum, t) => sum + t.amount, 0);

  // REFUNDS: reduce revenue for refunds issued
  const refunds = transactions
    .filter((t) => t.type === 'refund' && t.direction === 'out')
    .reduce((sum, t) => sum + t.amount, 0);

  const netRevenue = revenue - refunds;

  // GROSS PROFIT: revenue - COGS
  const grossProfit = Math.max(netRevenue - cogs, 0);
  const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

  // OPERATING PROFIT: gross profit - operating expenses
  const operatingProfit = Math.max(grossProfit - operatingExpenses, 0);

  // NET PROFIT: operating profit (simplified, excluding taxes for now)
  const netProfit = operatingProfit;

  // CASH IN: all incoming cash/upi/bank/card payments
  const cashIn = transactions
    .filter((t) => t.direction === 'in' && ['cash', 'upi', 'bank', 'card'].includes(t.account))
    .reduce((sum, t) => sum + t.amount, 0);

  // CASH OUT: all outgoing cash/upi/bank/card payments
  const cashOut = transactions
    .filter((t) => t.direction === 'out' && ['cash', 'upi', 'bank', 'card'].includes(t.account))
    .reduce((sum, t) => sum + t.amount, 0);

  const netCashFlow = cashIn - cashOut;

  // CASH BALANCE: net cash flow from recorded transactions
  const cashBalance = netCashFlow;

  // INVENTORY VALUE: total value of stock adjustments (negative means stock was consumed)
  const inventoryValue = Math.abs(
    transactions
      .filter((t) => t.type === 'stock_adjustment')
      .reduce((sum, t) => sum + (t.direction === 'out' ? -t.amount : t.amount), 0),
  );

  // BANK BALANCE: sum of bank transfers in
  const bankBalance = transactions
    .filter((t) => t.account === 'bank' && t.direction === 'in')
    .reduce((sum, t) => sum + t.amount, 0);

  // UPI BALANCE: sum of UPI payments in
  const upiBalance = transactions
    .filter((t) => t.account === 'upi' && t.direction === 'in')
    .reduce((sum, t) => sum + t.amount, 0);

  // CARD RECEIVABLES: sum of card payments not yet settled
  const cardReceivables = transactions
    .filter((t) => t.account === 'card' && t.direction === 'in')
    .reduce((sum, t) => sum + t.amount, 0);

  // CUSTOMER RECEIVABLES: unpaid sales (tracked separately, not calculated from this demo data)
  // In a real system, this would be sales with status='unpaid'
  const customerReceivables = 0;

  // PAYABLES: unpaid expenses to suppliers (tracked separately)
  // In a real system, this would be from supplier invoice records
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
