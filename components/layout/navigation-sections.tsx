'use client';

import Link from 'next/link';
import { BarChart3, ChevronDown, CreditCard, Home, LockKeyhole, Package, Receipt, Settings, Users } from 'lucide-react';
import { usePlan } from '@/components/billing/plan-provider';
import { checkPlanAccess } from '@/lib/plans/routes';
import type { ResolvedNavSection } from '@/lib/portals/nav';
import { activeWorkArea, workspaceAreas, workspaceLinkMatches } from '@/lib/workspace';

const AREA_ICONS = { home: Home, billing: Receipt, stock: Package, customers: Users, money: CreditCard, reports: BarChart3, settings: Settings };

/** Seven stable work areas; only the current area's tools expand. No nested menus. */
export function NavigationSections({ sections, activePath, variant, idPrefix, onNavigate }: {
  sections: ResolvedNavSection[]; activePath: string | null; variant: 'sidebar' | 'mobile'; idPrefix: string;
  revealAll?: boolean; onNavigate?: () => void; onLayoutChange?: () => void;
}) {
  const { entitlement } = usePlan();
  const areas = workspaceAreas(sections);
  const active = activeWorkArea(areas, activePath);
  return <div className="space-y-1" data-workspace-navigation={variant}>
    {areas.map(area => {
      const selected = area.id === active?.id;
      const destination = area.links.find(link => checkPlanAccess(entitlement, link.href).allowed) ?? area.links[0];
      const locked = !checkPlanAccess(entitlement, destination.href).allowed;
      const Icon = AREA_ICONS[area.id];
      const children = area.id === 'home' ? area.links.filter(link => link.href !== destination.href) : area.links;
      return <section key={area.id}>
        <Link href={destination.href} prefetch={!locked} onClick={onNavigate} data-nav-active={selected ? 'true' : undefined} aria-current={selected ? area.links.length === 1 && activePath === destination.href ? 'page' : 'location' : undefined} aria-describedby={`${idPrefix}-${area.id}-description`} className={`workspace-nav-link flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors ${area.id === 'settings' ? 'mt-5 border-t border-stone-200 pt-3' : ''} ${selected ? 'bg-panel font-semibold text-stone-900' : 'font-medium text-stone-700 hover:bg-panel/70 hover:text-stone-900'}`}>
          <Icon size={17} strokeWidth={1.8} aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{area.label}</span>{locked ? <LockKeyhole size={13} aria-label="Plan required" /> : children.length > 1 ? <ChevronDown size={13} className={selected ? '' : '-rotate-90'} aria-hidden="true" /> : null}
        </Link>
        <p id={`${idPrefix}-${area.id}-description`} className="sr-only">{area.description}</p>
        {children.length > 0 && area.links.length > 1 ? <div className="workspace-submenu" data-expanded={selected} inert={!selected} aria-hidden={!selected}><div className="workspace-submenu-clip"><div className="mb-2 ml-5 mt-1 border-l border-stone-200 pl-3">
          {children.map(link => {
            const isCurrent = workspaceLinkMatches(link.href, activePath);
            const allowed = checkPlanAccess(entitlement, link.href).allowed;
            const open = selected && allowed;
            return <Link key={link.href} href={link.href} prefetch={open} onClick={onNavigate} aria-current={activePath === link.href ? 'page' : undefined} className={`flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs ${isCurrent ? 'font-semibold text-stone-900' : 'text-stone-600 hover:bg-panel/70 hover:text-stone-900'}`}><span>{link.label}</span>{!allowed ? <LockKeyhole size={12} aria-label="Plan required" /> : null}</Link>;
          })}
        </div></div></div> : null}
      </section>;
    })}
  </div>;
}
