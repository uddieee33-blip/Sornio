import { businessDate, customerBalance, money } from '@/lib/accounting';
import type { StoreState } from '@/lib/store';

/** One list of everyday jobs; access is still checked by portal and plan. */
export const DAILY_TASKS = [
  { href: '/billing', label: 'Make a bill', description: 'Add items, print a bill and record payment.', icon: 'bill' },
  { href: '/payments', label: 'Collect payment', description: 'Record cash or UPI received from a customer.', icon: 'payment' },
  { href: '/customers', label: 'Customer dues', description: 'See who owes you and record money received.', icon: 'customers' },
  { href: '/products', label: 'Items & prices', description: 'Add what you sell and change prices.', icon: 'items' },
  { href: '/inventory', label: 'Check stock', description: 'See what is left and what needs restocking.', icon: 'stock' },
  { href: '/expenses', label: 'Add an expense', description: 'Record rent, purchases and other spending.', icon: 'expense' },
  { href: '/memberships', label: 'Plans & members', description: 'Add members and renew their plans.', icon: 'members' },
  { href: '/appointments', label: 'Bookings', description: 'See appointments and book the next visit.', icon: 'bookings' },
] as const;

export function shopkeeperSummary(state: Pick<StoreState, 'profile' | 'transactions' | 'products' | 'customers'>, reference = new Date()) {
  const date = businessDate(reference, state.profile.timezone || 'Asia/Kolkata');
  const receivedToday = money(state.transactions.filter((entry) => entry.date === date && entry.direction === 'in' && entry.type !== 'transfer' && ['cash', 'bank', 'upi', 'card'].includes(entry.account)).reduce((sum, entry) => sum + entry.amount, 0));
  const customersOwe = money(state.customers.reduce((sum, customer) => sum + Math.max(0, customerBalance(customer, state.transactions)), 0));
  const lowStock = state.products.filter((product) => product.status === 'Active' && product.itemType === 'product' && product.stock <= product.reorderLevel).length;
  return { receivedToday, customersOwe, lowStock };
}
