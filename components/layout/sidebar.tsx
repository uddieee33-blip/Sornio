'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Building2,
  CircleDollarSign,
  Columns2,
  CreditCard,
  Dumbbell,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  Sparkles,
  Store,
  Truck,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const sections: { title: string; links: { href: string; label: string; icon: LucideIcon }[] }[] = [
  {
    title: 'Overview',
    links: [
      { href: '/home', label: 'Overview', icon: Store },
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/insights', label: 'AI Insights', icon: Sparkles },
      { href: '/alerts', label: 'Alerts', icon: Bell },
    ],
  },
  {
    title: 'Operations',
    links: [
      { href: '/business', label: 'Business Setup', icon: Building2 },
      { href: '/products', label: 'Products', icon: Package },
      { href: '/inventory', label: 'Inventory', icon: Columns2 },
      { href: '/sales', label: 'Sales', icon: Zap },
      { href: '/billing', label: 'Billing', icon: Receipt },
      { href: '/payments', label: 'Payments', icon: CreditCard },
      { href: '/expenses', label: 'Expenses', icon: Wallet },
      { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
    ],
  },
  {
    title: 'People',
    links: [
      { href: '/memberships', label: 'Memberships', icon: Dumbbell },
      { href: '/customers', label: 'Customers', icon: Users },
      { href: '/suppliers', label: 'Suppliers', icon: Truck },
    ],
  },
  {
    title: 'Analysis',
    links: [
      { href: '/reports', label: 'Reports', icon: BarChart3 },
      { href: '/comparisons', label: 'Comparisons', icon: CircleDollarSign },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 border-r border-white/[0.06] bg-[#0d1017]/80 backdrop-blur md:flex md:flex-col">
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gradient shadow-glow">
          <Store size={22} className="text-white" />
        </div>
        <div>
          <p className="font-display text-base font-bold tracking-tight text-white">DukaanOS</p>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-brand-300">Owner Console</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-4 pb-6">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">{section.title}</p>
            <div className="space-y-1">
              {section.links.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                      active ? 'bg-brand-500/10 text-white ring-1 ring-inset ring-brand-500/25' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    {active ? <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-gradient shadow-glow-sm" /> : null}
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${active ? 'bg-brand-gradient text-white shadow-glow-sm' : 'bg-white/[0.04] text-zinc-500 group-hover:text-zinc-300'}`}>
                      <Icon size={15} strokeWidth={2.2} />
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-4">
        <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/[0.06]">
          <p className="text-xs font-semibold text-white">Cult Fitness</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">Demo business · all data local</p>
        </div>
      </div>
    </aside>
  );
}
