export const demoProducts = [
  { id: 'p1', name: 'Organic Soap', category: 'Personal Care', sellingPrice: 280, cost: 130, stock: 18, status: 'Active' },
  { id: 'p2', name: 'Signature Tea', category: 'Food', sellingPrice: 120, cost: 56, stock: 32, status: 'Active' },
  { id: 'p3', name: 'Website Setup', category: 'Services', sellingPrice: 15000, cost: 6500, stock: 0, status: 'Active' },
  { id: 'p4', name: 'Bamboo Mug', category: 'Home', sellingPrice: 499, cost: 260, stock: 12, status: 'Inactive' },
];

export const demoTransactions = [
  { type: 'sale', amount: 125000, direction: 'in', category: 'Revenue', account: 'revenue' },
  { type: 'sale', amount: 35000, direction: 'in', category: 'Revenue', account: 'revenue' },
  { type: 'expense', amount: 28000, direction: 'out', category: 'Rent', account: 'expense' },
  { type: 'expense', amount: 4200, direction: 'out', category: 'Electricity', account: 'expense' },
  { type: 'payment', amount: 30000, direction: 'in', category: 'Cash', account: 'cash' },
  { type: 'payment', amount: 12000, direction: 'in', category: 'UPI', account: 'upi' },
  { type: 'stock_adjustment', amount: 6000, direction: 'out', category: 'Inventory', account: 'inventory' },
  { type: 'sale', amount: 18000, direction: 'in', category: 'Revenue', account: 'revenue' },
];
