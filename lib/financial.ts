export const demoMetrics = {
  revenue: 185000,
  grossProfit: 71000,
  grossMargin: 38,
  operatingExpenses: 43000,
  operatingProfit: 28000,
  estimatedNetProfit: 26500,
  cashBalance: 48000,
  bankBalance: 120000,
  upiBalance: 7000,
  cardReceivables: 9000,
  inventoryValue: 34000,
  customerReceivables: 12000,
  payables: 18000,
};

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}
