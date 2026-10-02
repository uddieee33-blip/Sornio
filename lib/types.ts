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

export type MembershipPlan = {
  id: string;
  name: string;
  durationMonths: number;
  price: number;
  type: 'monthly' | 'quarterly' | 'half_yearly' | 'annual';
  isActive: boolean;
  description?: string;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  preferredChannel: 'sms' | 'whatsapp' | 'both';
  businessId: string;
};

export type ReceiptMode = 'digital' | 'physical' | 'both';

export type InvoiceItem = {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  category: string;
};

export type Invoice = {
  id: string;
  customerName: string;
  businessName: string;
  createdAt: string;
  amount: number;
  paymentMethod: 'Cash' | 'UPI' | 'Card' | 'Bank Transfer';
  receiptMode: ReceiptMode;
  status: 'paid' | 'pending';
  items: InvoiceItem[];
};

export type MembershipSubscription = {
  id: string;
  customerId: string;
  planId: string;
  startDate: string;
  expiryDate: string;
  status: 'active' | 'expiring_soon' | 'expired';
  autoRenew: boolean;
};

export type ReminderTemplate = {
  id: string;
  name: string;
  channel: 'sms' | 'whatsapp' | 'both';
  message: string;
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

export type BusinessTemplate = {
  id: string;
  name: string;
  category: 'retail' | 'service' | 'fitness' | 'hospitality' | 'electronics';
  description: string;
  modules: string[];
};
