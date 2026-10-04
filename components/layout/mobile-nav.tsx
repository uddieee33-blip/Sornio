import Link from 'next/link';

export function MobileNav() {
  const links = [
    { href: '/', label: 'Overview' },
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/products', label: 'Products' },
    { href: '/sales', label: 'Sales' },
    { href: '/billing', label: 'Billing' },
    { href: '/memberships', label: 'Memberships' },
    { href: '/expenses', label: 'Expenses' },
    { href: '/inventory', label: 'Inventory' },
    { href: '/customers', label: 'Customers' },
  ];

  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3 md:hidden">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="whitespace-nowrap rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
