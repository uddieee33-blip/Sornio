export type Business = {
  id: string;
  name: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail?: string;
  businessType: string;
  description: string;
  currency: string;
  timezone: string;
  upiId?: string;
  bankName?: string;
  ifscCode?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BusinessSettings = {
  id: string;
  businessId: string;
  receiptMode: 'digital' | 'physical' | 'both';
  sendSmsReminders: boolean;
  sendWhatsappReminders: boolean;
  autoGenerateInvoiceNumber: boolean;
  taxRate: number;
  allowMemberships: boolean;
  allowInventory: boolean;
  allowAppointments: boolean;
  allowDigitalReceipts: boolean;
  allowPhysicalReceipts: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BusinessTemplate = {
  id: string;
  name: string;
  category: 'retail' | 'service' | 'fitness' | 'hospitality' | 'electronics' | 'general';
  description: string;
  recommendedModules: string[];
};

export type BusinessSnapshot = {
  businessId: string;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  cashBalance: number;
  bankBalance: number;
  upiBalance: number;
  inventoryValue: number;
  activeMembers: number;
  pendingPayments: number;
  lastUpdated: string;
};

export type BusinessMetrics = {
  dailyRevenue: number;
  weeklyRevenue: number;
  monthlyRevenue: number;
  totalCustomers: number;
  repeatCustomers: number;
  customerRetentionRate: number;
  averageOrderValue: number;
  topProduct: string;
  topProductRevenue: number;
};

export type AuditEvent = {
  id: string;
  businessId: string;
  type: 'invoice' | 'payment' | 'inventory' | 'member' | 'security' | 'system';
  actor: string;
  summary: string;
  createdAt: string;
};
