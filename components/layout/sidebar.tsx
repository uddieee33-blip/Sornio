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
      { href: '/', label: 'Overview', icon: Store },
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
    <aside className="hidden w-72 bg-sidebar-gradient text-slate-100 md:flex md:flex-col">
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gradient shadow-glow">
          <Store size={22} className="text-white" />
        </div>
        <div>
          <p className="text-base font-bold tracking-tight text-white">DukaanOS</p>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-indigo-300">Owner Console</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-4 pb-6">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{section.title}</p>
            <div className="space-y-1">
              {section.links.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                      active
                        ? 'bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${active ? 'bg-brand-gradient text-white' : 'bg-white/5 text-slate-400 group-hover:text-slate-200'}`}>
                      <Icon size={15} strokeWidth={2.2} />
                    </span>
                    {item.label}
                    {active ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400" /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-xl bg-white/5 p-3 ring-1 ring-inset ring-white/10">
          <p className="text-xs font-semibold text-white">Cult Fitness</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Demo business · all data local</p>
        </div>
      </div>
    </aside>
  );
}
