export type ReceiptMode = 'digital' | 'physical' | 'both';
export type PaymentMethod = 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Credit' | 'Other';
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

export const samplePaymentRecords: PaymentRecord[] = [
  {
    id: 'pay-1',
    businessId: 'biz-1',
    invoiceId: 'INV-1001',
    customerName: 'John Wilson',
    amount: 4999,
    paymentMethod: 'UPI',
    status: 'paid',
    paymentDate: '2026-10-02T10:04:00.000Z',
    gateway: 'UPI',
  },
  {
    id: 'pay-2',
    businessId: 'biz-2',
    invoiceId: 'INV-1002',
    customerName: 'Aisha Khan',
    amount: 500,
    paymentMethod: 'Cash',
    status: 'partial',
    paymentDate: '2026-10-02T12:45:00.000Z',
    gateway: 'Cash',
  },
  {
    id: 'pay-3',
    businessId: 'biz-1',
    customerName: 'Priya Nair',
    amount: 15999,
    paymentMethod: 'Card',
    status: 'paid',
    paymentDate: '2026-09-25T16:20:00.000Z',
    gateway: 'Razorpay',
  },
  {
    id: 'pay-4',
    businessId: 'biz-1',
    invoiceId: 'INV-1001',
    customerName: 'John Wilson',
    amount: 0,
    paymentMethod: 'UPI',
    status: 'failed',
    paymentDate: '2026-10-02T09:58:00.000Z',
    gateway: 'UPI',
  },
];

export function summarizePaymentRecords(records: PaymentRecord[]) {
  const collected = records
    .filter((record) => record.status === 'paid' || record.status === 'partial')
    .reduce((sum, record) => sum + record.amount, 0);

  const failed = records.filter((record) => record.status === 'failed').length;
  const pending = records.filter((record) => record.status === 'pending').length;

  const byMethod = records.reduce<Record<PaymentMethod, number>>((acc, record) => {
    if (record.status === 'paid' || record.status === 'partial') {
      acc[record.paymentMethod] = (acc[record.paymentMethod] ?? 0) + record.amount;
    }
    return acc;
  }, { Cash: 0, UPI: 0, Card: 0, 'Bank Transfer': 0, Credit: 0, Other: 0 });

  return { collected, failed, pending, byMethod };
}
