import Link from 'next/link';

const nav = [
  { href: '/', label: 'Overview' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/business', label: 'Business Setup' },
  { href: '/products', label: 'Products' },
  { href: '/sales', label: 'Sales' },
  { href: '/billing', label: 'Billing' },
  { href: '/payments', label: 'Payments' },
  { href: '/expenses', label: 'Expenses' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/memberships', label: 'Memberships' },
  { href: '/customers', label: 'Customers' },
  { href: '/suppliers', label: 'Suppliers' },
  { href: '/reports', label: 'Reports' },
  { href: '/insights', label: 'Insights' },
  { href: '/alerts', label: 'Alerts' },
  { href: '/comparisons', label: 'Comparisons' },
  { href: '/settings', label: 'Settings' },
];

export function Sidebar() {
  return (
    <aside className="hidden w-72 border-r border-slate-200 bg-slate-950 text-slate-100 md:flex md:flex-col">
      <div className="border-b border-slate-800 px-6 py-5">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">DukaanOS</p>
        <h2 className="mt-2 text-xl font-semibold">Owner Console</h2>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto p-4">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center rounded-xl px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-slate-800 p-4 text-xs text-slate-400">
        Transaction-driven financial engine
      </div>
    </aside>
  );
}
