export type FinancialTransaction = {
  type: 'sale' | 'expense' | 'payment' | 'stock_adjustment' | 'opening';
  category: string;
  amount: number;
  direction: 'in' | 'out';
  account: 'cash' | 'bank' | 'upi' | 'card' | 'revenue' | 'expense' | 'inventory' | 'receivables';
};

export function summarizeFinancials(transactions: FinancialTransaction[]) {
  const revenue = transactions
    .filter((item) => item.type === 'sale' && item.direction === 'in')
    .reduce((sum, item) => sum + item.amount, 0);

  const operatingExpenses = transactions
    .filter((item) => item.type === 'expense' && item.direction === 'out')
    .reduce((sum, item) => sum + item.amount, 0);

  const grossProfit = Math.max(revenue - 0.42 * revenue, 0);
  const netProfit = Math.max(revenue - operatingExpenses, 0);
  const cashIn = transactions
    .filter((item) => item.direction === 'in' && ['cash', 'upi', 'bank', 'card'].includes(item.account))
    .reduce((sum, item) => sum + item.amount, 0);
  const cashOut = transactions
    .filter((item) => item.direction === 'out' && ['cash', 'bank', 'upi', 'card'].includes(item.account))
    .reduce((sum, item) => sum + item.amount, 0);

  const cashBalance = cashIn - cashOut;
  const inventoryValue = transactions
    .filter((item) => item.type === 'stock_adjustment')
    .reduce((sum, item) => sum + item.amount, 0);

  return {
    revenue,
    grossProfit,
    operatingExpenses,
    grossMargin: revenue ? ((grossProfit / revenue) * 100) : 0,
    operatingProfit: Math.max(revenue - operatingExpenses, 0),
    netProfit,
    cashBalance,
    cashIn,
    cashOut,
    netCashFlow: cashIn - cashOut,
    inventoryValue,
    customerReceivables: 18000,
    payables: 12000,
  };
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}
