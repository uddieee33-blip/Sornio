'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function MobileNav() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Overview' },
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/products', label: 'Products' },
    { href: '/sales', label: 'Sales' },
    { href: '/billing', label: 'Billing' },
    { href: '/memberships', label: 'Memberships' },
    { href: '/expenses', label: 'Expenses' },
    { href: '/inventory', label: 'Inventory' },
    { href: '/insights', label: 'Insights' },
    { href: '/customers', label: 'Customers' },
  ];

  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3 md:hidden">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium ${
              active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
