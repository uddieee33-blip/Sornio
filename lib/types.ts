export type Business = {
  id: string;
  name: string;
  business_type: string;
  currency: string;
  timezone: string;
  description: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  business_id: string;
  name: string;
  item_type: 'product' | 'service';
  category: string | null;
  description: string | null;
  selling_price: number;
  cost_price: number;
  sell_price: number;
  tax_rate: number;
  stock_quantity: number;
  reorder_level: number;
  sku: string | null;
  supplier_id: string | null;
  unit: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type FinancialSnapshot = {
  revenue: number;
  grossProfit: number;
  operatingExpenses: number;
  operatingProfit: number;
  estimatedNetProfit: number;
  cashBalance: number;
  bankBalance: number;
  upiBalance: number;
  cardReceivables: number;
  inventoryValue: number;
  customerReceivables: number;
  payables: number;
  grossMargin: number;
};
