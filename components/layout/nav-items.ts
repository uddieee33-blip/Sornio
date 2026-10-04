/**
 * One navigation source of truth.
 *
 * The sidebar, the mobile nav, the command palette, and the route warmer all
 * read from this list, so a new module can never appear in one place and be
 * missing from another.
 */

import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  BellRing,
  Building2,
  CircleDollarSign,
  Columns2,
  CreditCard,
  Dumbbell,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Package,
  Percent,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra search terms so ⌘K finds the module by what the owner calls it. */
  keywords?: string;
};

export type NavSection = { title: string; links: NavLink[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    links: [
      { href: '/home', label: 'Owner Cockpit', icon: Store, keywords: 'today summary morning' },
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, keywords: 'charts kpi' },
      { href: '/insights', label: 'AI Insights', icon: Sparkles, keywords: 'health score advice tips' },
      { href: '/alerts', label: 'Alerts', icon: Bell, keywords: 'stock expiry warnings' },
    ],
  },
  {
    title: 'Operations',
    links: [
      { href: '/business', label: 'Business Setup', icon: Building2, keywords: 'profile template type onboarding' },
      { href: '/products', label: 'Products', icon: Package, keywords: 'catalog items price cost stock' },
      { href: '/inventory', label: 'Inventory', icon: Columns2, keywords: 'stock levels' },
      { href: '/sales', label: 'Sales', icon: Zap, keywords: 'new sale counter billing' },
      { href: '/billing', label: 'Billing', icon: Receipt, keywords: 'invoice gst receipt tax' },
      { href: '/payments', label: 'Payments', icon: CreditCard, keywords: 'collect cash upi card' },
      { href: '/expenses', label: 'Expenses', icon: Wallet, keywords: 'spend rent bills' },
      { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight, keywords: 'ledger entries' },
      { href: '/marketing', label: 'Marketing', icon: Megaphone, keywords: 'campaign spend ads' },
    ],
  },
  {
    title: 'People',
    links: [
      { href: '/memberships', label: 'Memberships', icon: Dumbbell, keywords: 'plans subscription renewal gym' },
      { href: '/reminders', label: 'Reminders', icon: BellRing, keywords: 'sms whatsapp expiry follow up' },
      { href: '/customers', label: 'Customers', icon: Users, keywords: 'clients udhaar khata' },
      { href: '/suppliers', label: 'Suppliers', icon: Truck, keywords: 'vendors purchase' },
      { href: '/team', label: 'Team & Roles', icon: ShieldCheck, keywords: 'staff access permission cashier' },
    ],
  },
  {
    title: 'Money',
    links: [
      { href: '/cashflow', label: 'Cash Flow', icon: Landmark, keywords: 'bank cash balance' },
      { href: '/profitability', label: 'Profitability', icon: Percent, keywords: 'margin profit' },
    ],
  },
  {
    title: 'Analysis',
    links: [
      { href: '/reports', label: 'Reports', icon: BarChart3, keywords: 'export csv download' },
      { href: '/comparisons', label: 'Comparisons', icon: CircleDollarSign, keywords: 'month over month growth' },
      { href: '/audit', label: 'Audit History', icon: ScrollText, keywords: 'log changes trace' },
      { href: '/security', label: 'Trust Centre', icon: ShieldCheck, keywords: 'security encryption privacy rbac backup' },
      { href: '/settings', label: 'Settings', icon: Settings, keywords: 'preferences language currency' },
    ],
  },
];

export const ALL_NAV_LINKS: NavLink[] = NAV_SECTIONS.flatMap((section) => section.links);
