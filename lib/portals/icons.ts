/**
 * Portal icons.
 *
 * Blueprints carry icon *names* (plain strings) so middleware can import them;
 * this is the one place those names become components, which keeps the icon set
 * exhaustive by construction — add a name to `IconName` and TypeScript will
 * refuse to build until it is mapped here.
 */

import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  BellRing,
  Blocks,
  Boxes,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarClock,
  CircleDollarSign,
  Coffee,
  CreditCard,
  Dumbbell,
  IdCard,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Package,
  Percent,
  Receipt,
  Scissors,
  ScrollText,
  Settings,
  Shirt,
  ShieldCheck,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Store,
  Truck,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { IconName } from './types';

export const PORTAL_ICONS: Record<IconName, LucideIcon> = {
  // business-type marks — one glance tells the owner which console they are in
  gym: Dumbbell,
  cafe: Coffee,
  kirana: ShoppingBasket,
  salon: Scissors,
  electronics: Smartphone,
  boutique: Shirt,
  service: Briefcase,
  general: Blocks,
  // modules
  cockpit: Store,
  dashboard: LayoutDashboard,
  insights: Sparkles,
  alerts: Bell,
  business: Building2,
  catalog: Package,
  inventory: Boxes,
  checkins: CalendarCheck,
  appointments: CalendarClock,
  sales: Zap,
  billing: Receipt,
  payments: CreditCard,
  expenses: Wallet,
  transactions: ArrowLeftRight,
  marketing: Megaphone,
  memberships: IdCard,
  reminders: BellRing,
  customers: Users,
  suppliers: Truck,
  team: ShieldCheck,
  cashflow: Landmark,
  profitability: Percent,
  reports: BarChart3,
  comparisons: CircleDollarSign,
  audit: ScrollText,
  security: ShieldCheck,
  settings: Settings,
};

export function portalIcon(name: IconName): LucideIcon {
  return PORTAL_ICONS[name] ?? Blocks;
}
