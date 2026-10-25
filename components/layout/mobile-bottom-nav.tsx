'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { usePlan } from '@/components/billing/plan-provider';
import { checkPlanAccess } from '@/lib/plans/routes';
import { workspaceAreas, workspaceLinkMatches } from '@/lib/workspace';
import { usePortal } from '@/lib/portals/portal-provider';

/**
 * Thumb-first navigation for the console. The quick destinations follow the same work
 * areas as desktop and include only tools granted to this business.
 */
export function MobileBottomNav({
  menuOpen,
  onOpenMenu,
}: {
  menuOpen: boolean;
  onOpenMenu: () => void;
}) {
  const pathname = usePathname();
  const { nav, portal } = usePortal();
  const { entitlement } = usePlan();
  const links = nav.flatMap((section) => section.links);
  const homeIcon = links.find((link) => link.href === '/home')?.icon ?? Home;
  const areas = workspaceAreas(nav, portal.id);
  const homeActive = areas.find(area => area.id === 'home')?.links.some(link => workspaceLinkMatches(link.href, pathname)) ?? pathname === '/home';
  const actions = areas
    .filter(area => !['home', 'reports', 'settings'].includes(area.id))
    .flatMap(area => {
      const link = area.links.find(item => checkPlanAccess(entitlement, item.href).allowed);
      return link ? [{ ...link, routes: area.links.map(item => item.href), shortLabel: area.label }] : [];
    }).slice(0, 2);
  // Home + portal actions + More: do not leave empty tabs for portals with fewer actions.
  const columnsClass = actions.length === 2 ? 'grid-cols-4' : actions.length === 1 ? 'grid-cols-3' : 'grid-cols-2';
  const moreActive = menuOpen || (!homeActive && !actions.some(action => action.routes.some(href => workspaceLinkMatches(href, pathname))));

  return (
    <nav
      aria-label="Quick navigation"
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-panel/97 shadow-[0_-8px_24px_-18px_rgba(58,54,38,0.4)] lg:hidden"
    >
      <div className={`mx-auto grid h-14 w-full max-w-xl ${columnsClass} gap-1 px-2 pt-1`}>
        <NavItem
          href="/home"
          label="Home"
          icon={homeIcon}
          active={homeActive}
          ariaCurrent={homeActive ? 'page' : undefined}
        />
        {actions.map((action) => (
          <NavItem
            key={action.href}
            href={action.href}
            label={action.shortLabel}
            title={action.label}
            icon={action.icon}
            active={action.routes.some(href => workspaceLinkMatches(href, pathname))}
            ariaCurrent={action.routes.some(href => workspaceLinkMatches(href, pathname)) ? 'page' : undefined}
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

