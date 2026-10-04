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
    <nav className="flex gap-2 overflow-x-auto border-b border-white/[0.06] bg-[#0d1017]/80 px-4 py-3 backdrop-blur md:hidden">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold transition ${
              active ? 'bg-brand-gradient text-white shadow-glow-sm' : 'bg-white/[0.05] text-zinc-400 ring-1 ring-inset ring-white/[0.06] hover:text-white'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
