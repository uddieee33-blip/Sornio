'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MoreHorizontal, Package, type LucideIcon } from 'lucide-react';
import { usePortal } from '@/lib/portals/portal-provider';

const compactLabels: Record<string, string> = {
  '/appointments': 'Bookings',
  '/billing': 'Bills',
  '/check-ins': 'Check in',
  '/customers': 'People',
  '/expenses': 'Expenses',
  '/memberships': 'Plans',
  '/payments': 'Pay',
  '/products': 'Items',
  '/sales': 'Sales',
  '/scan': 'Scan',
};

/**
 * Thumb-first navigation for the console. The two quick actions come from the
 * active business portal, so a gym gets check-ins and renewals while a shop gets
 * scanning and sales. Everything else stays one tap away under More.
 */
export function MobileBottomNav({
  menuOpen,
  onOpenMenu,
}: {
  menuOpen: boolean;
  onOpenMenu: () => void;
}) {
  const pathname = usePathname();
  const { portal, nav } = usePortal();
  const links = nav.flatMap((section) => section.links);
  const homeIcon = links.find((link) => link.href === '/home')?.icon ?? Home;
  const actions = portal.cockpit.actions
    .filter((action) => action.href !== '/home')
    .filter((action, index, all) => all.findIndex((item) => item.href === action.href) === index)
    .slice(0, 2)
    .map((action) => ({
      ...action,
      icon: links.find((link) => link.href === action.href)?.icon ?? Package,
      shortLabel: compactLabels[action.href] ?? action.label,
    }));
  const quickRoutes = new Set(actions.map((action) => action.href));
  // Home + portal actions + More: do not leave empty tabs for portals with fewer actions.
  const columnsClass = actions.length === 2 ? 'grid-cols-4' : actions.length === 1 ? 'grid-cols-3' : 'grid-cols-2';
  const moreActive = menuOpen || (pathname !== '/home' && !quickRoutes.has(pathname));

  return (
    <nav
      aria-label="Quick navigation"
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-panel/97 shadow-[0_-8px_24px_-18px_rgba(58,54,38,0.4)] lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className={`mx-auto grid h-14 w-full max-w-xl ${columnsClass} gap-1 px-2 pt-1`}>
        <NavItem
          href="/home"
          label="Home"
          icon={homeIcon}
          active={pathname === '/home'}
          ariaCurrent={pathname === '/home' ? 'page' : undefined}
        />
        {actions.map((action) => (
          <NavItem
            key={action.href}
            href={action.href}
            label={action.shortLabel}
            title={action.label}
            icon={action.icon}
            active={pathname === action.href}
            ariaCurrent={pathname === action.href ? 'page' : undefined}
          />
        ))}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label={menuOpen ? 'Navigation menu open' : 'Open all navigation'}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          className={`touch-manipulation flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition-colors ${
            moreActive ? 'bg-portal/10 text-portal' : 'text-stone-600 active:bg-stone-100'
          }`}
        >
          <MoreHorizontal size={19} strokeWidth={2.2} aria-hidden="true" />
          <span className="max-w-full truncate">More</span>
        </button>
      </div>
    </nav>
  );
}

function NavItem({
  href,
  label,
  title,
  icon: Icon,
  active,
  ariaCurrent,
}: {
  href: string;
  label: string;
  title?: string;
  icon: LucideIcon;
  active: boolean;
  ariaCurrent?: 'page';
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-label={title ?? label}
      aria-current={ariaCurrent}
      data-press="soft"
      className={`touch-manipulation flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition-[color,background-color] duration-base ease-swift ${
        active ? 'bg-portal/10 text-portal' : 'text-stone-600 active:bg-stone-100'
      }`}
    >
      {/*
        The icon lifts a hair when its tab becomes current. A thumb covers the
        label at the moment of the tap, so the icon is the only part of the
        control the user can still see confirming where they landed.
      */}
      <Icon
        size={19}
        strokeWidth={2.1}
        aria-hidden="true"
        className={`transition-transform duration-base ease-spring ${active ? '-translate-y-px scale-110' : ''}`}
      />
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

