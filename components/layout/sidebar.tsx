'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const sections: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Overview',
    links: [
      { href: '/', label: 'Overview' },
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/insights', label: 'AI Insights' },
      { href: '/alerts', label: 'Alerts' },
    ],
  },
  {
    title: 'Operations',
    links: [
      { href: '/business', label: 'Business Setup' },
      { href: '/products', label: 'Products' },
      { href: '/inventory', label: 'Inventory' },
      { href: '/sales', label: 'Sales' },
      { href: '/billing', label: 'Billing' },
      { href: '/payments', label: 'Payments' },
      { href: '/expenses', label: 'Expenses' },
      { href: '/transactions', label: 'Transactions' },
    ],
  },
  {
    title: 'People',
    links: [
      { href: '/memberships', label: 'Memberships' },
      { href: '/customers', label: 'Customers' },
      { href: '/suppliers', label: 'Suppliers' },
    ],
  },
  {
    title: 'Analysis',
    links: [
      { href: '/reports', label: 'Reports' },
      { href: '/comparisons', label: 'Comparisons' },
      { href: '/settings', label: 'Settings' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 border-r border-slate-800 bg-slate-950 text-slate-100 md:flex md:flex-col">
      <div className="border-b border-slate-800 px-6 py-5">
        <p className="text-xs uppercase tracking-[0.25em] text-emerald-400">DukaanOS</p>
        <h2 className="mt-2 text-xl font-semibold">Owner Console</h2>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto p-4">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{section.title}</p>
            <div className="space-y-1">
              {section.links.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition ${
                      active
                        ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/30'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {item.label}
                    {active ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-800 p-4 text-xs text-slate-400">
        Transaction-driven financial engine
      </div>
    </aside>
  );
}
