export type ReceiptMode = 'digital' | 'physical' | 'both';
export type PaymentMethod = 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Other';
export type PaymentStatus = 'paid' | 'pending' | 'partial' | 'failed';

export type InvoiceItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type Invoice = {
  id: string;
  businessId: string;
  customerName: string;
  customerPhone?: string;
  createdAt: string;
  dueDate?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  receiptMode: ReceiptMode;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  totalAmount: number;
  notes?: string;
};

export type PaymentRecord = {
  id: string;
  businessId: string;
  invoiceId?: string;
  customerName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  paymentDate: string;
  gateway: 'Razorpay' | 'UPI' | 'Cash' | 'Manual';
};

export const sampleInvoices: Invoice[] = [
  {
    id: 'INV-1001',
    businessId: 'biz-1',
    customerName: 'John Wilson',
    customerPhone: '+91 98765 43210',
    createdAt: '2026-10-02T10:00:00.000Z',
    paymentMethod: 'UPI',
    paymentStatus: 'paid',
    receiptMode: 'both',
    items: [{ id: 'it-1', name: 'Quarterly membership', category: 'Membership', quantity: 1, unitPrice: 4999, total: 4999 }],
    subtotal: 4999,
    tax: 0,
    totalAmount: 4999,
    notes: 'Renewal invoice',
  },
  {
    id: 'INV-1002',
    businessId: 'biz-2',
    customerName: 'Aisha Khan',
    customerPhone: '+91 91234 56789',
    createdAt: '2026-10-02T12:30:00.000Z',
    paymentMethod: 'Cash',
    paymentStatus: 'pending',
    receiptMode: 'physical',
    items: [
      { id: 'it-2', name: 'Cold Coffee', category: 'Beverages', quantity: 2, unitPrice: 260, total: 520 },
      { id: 'it-3', name: 'Veg Sandwich', category: 'Food', quantity: 1, unitPrice: 390, total: 390 },
    ],
    subtotal: 910,
    tax: 55,
    totalAmount: 965,
    notes: 'Cafe order receipt',
  },
];
