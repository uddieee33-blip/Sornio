'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Sparkles } from 'lucide-react';
import { checkPlanAccess } from '@/lib/plans/routes';
import { usePlan } from '@/components/billing/plan-provider';
import type { ResolvedNavLink, ResolvedNavSection } from '@/lib/portals/nav';

type NavigationEntry =
  | { kind: 'link'; link: ResolvedNavLink }
  | { kind: 'branch'; key: 'sales' | 'catalog'; parent: ResolvedNavLink; children: ResolvedNavLink[] };

type Variant = 'sidebar' | 'mobile';

type DisclosureState = {
  openSections: Set<number>;
  closedActiveSection: string | null;
  openBranches: Set<string>;
  closedActiveBranch: string | null;
};

function entriesForSection(section: ResolvedNavSection): NavigationEntry[] {
  const sales = section.links.find((link) => link.module === 'sales');
  const salesChildren = section.links.filter((link) => link.module === 'scan' || link.module === 'billing');
  const catalog = section.links.find((link) => link.module === 'catalog');
  const catalogChildren = section.links.filter((link) => link.module === 'inventory');

  const branches = new Map<string, NavigationEntry>();
  const consumed = new Set<string>();

  if (sales && salesChildren.length > 0) {
    branches.set(sales.href, { kind: 'branch', key: 'sales', parent: sales, children: salesChildren });
    consumed.add(sales.href);
    salesChildren.forEach((link) => consumed.add(link.href));
  }

  if (catalog && catalogChildren.length > 0) {
    branches.set(catalog.href, { kind: 'branch', key: 'catalog', parent: catalog, children: catalogChildren });
    consumed.add(catalog.href);
    catalogChildren.forEach((link) => consumed.add(link.href));
  }

  const result: NavigationEntry[] = [];
  const addedBranches = new Set<string>();
  for (const link of section.links) {
    const branch = branches.get(link.href);
    if (branch) {
      if (!addedBranches.has(link.href)) {
        result.push(branch);
        addedBranches.add(link.href);
      }
      continue;
    }
    if (!consumed.has(link.href)) result.push({ kind: 'link', link });
  }
  return result;
}

function linkIsActive(link: ResolvedNavLink, pathname: string | null): boolean {
  return pathname === link.href;
}

function linkAccessIsOpen(link: ResolvedNavLink, entitlement: Parameters<typeof checkPlanAccess>[0]): boolean {
  return checkPlanAccess(entitlement, link.href).allowed;
}

export function NavigationSections({
  sections,
  activePath,
  variant,
  idPrefix,
  revealAll = false,
  onNavigate,
  onLayoutChange,
}: {
  sections: ResolvedNavSection[];
  activePath: string | null;
  variant: Variant;
  /** Distinct IDs are needed because desktop and mobile navigation coexist in the DOM. */
  idPrefix: string;
  revealAll?: boolean;
  onNavigate?: () => void;
  onLayoutChange?: () => void;
}) {
  const { entitlement } = usePlan();
  const activeSection = sections.findIndex((section) => section.links.some((link) => linkIsActive(link, activePath)));
  const fallbackSection = activeSection < 0 && sections.length > 0 ? 0 : -1;
  const activeSectionKey = activeSection >= 0
    ? `${activePath ?? ''}:${activeSection}`
    : fallbackSection >= 0
      ? `fallback:${fallbackSection}`
      : null;
  const activeBranch = activeSection >= 0
    ? entriesForSection(sections[activeSection]).find(
        (entry) => entry.kind === 'branch' && entry.children.some((link) => linkIsActive(link, activePath)),
      )
    : undefined;
  const activeBranchKey = activeBranch?.kind === 'branch'
    ? `${activePath ?? ''}:${activeSection}:${activeBranch.key}`
    : null;

  const [disclosures, setDisclosures] = useState<DisclosureState>(() => ({
    openSections: new Set(fallbackSection >= 0 ? [fallbackSection] : []),
    closedActiveSection: null,
    openBranches: new Set(),
    closedActiveBranch: null,
  }));

  // The active section/group is visible by default, without an effect or a
  // second render. A person can still collapse it; another destination opens
  // its own path automatically while preserving any manually opened groups.
  const toggleSection = (index: number, isOpen: boolean) => {
    const key = index === activeSection || index === fallbackSection ? activeSectionKey : null;
    setDisclosures((current) => {
      const openSections = new Set(current.openSections);
      if (isOpen) {
        openSections.delete(index);
        return { ...current, openSections, closedActiveSection: key ?? current.closedActiveSection };
      }
      openSections.add(index);
      return {
        ...current,
        openSections,
        closedActiveSection: current.closedActiveSection === key ? null : current.closedActiveSection,
      };
    });
    onLayoutChange?.();
  };

  const toggleBranch = (key: string, isOpen: boolean, isActiveBranch: boolean) => {
    setDisclosures((current) => {
      const openBranches = new Set(current.openBranches);
      if (isOpen) {
        openBranches.delete(key);
        return {
          ...current,
          openBranches,
          closedActiveBranch: isActiveBranch ? activeBranchKey : current.closedActiveBranch,
        };
      }
      openBranches.add(key);
      return {
        ...current,
        openBranches,
        closedActiveBranch: current.closedActiveBranch === activeBranchKey ? null : current.closedActiveBranch,
      };
    });
    onLayoutChange?.();
  };

  const sectionButtonClass = variant === 'mobile'
    ? 'flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-stone-600 transition hover:bg-stone-100 hover:text-stone-900'
    : 'flex min-h-9 w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-stone-600 transition hover:bg-stone-50 hover:text-stone-900';

  return (
    <div className={variant === 'mobile' ? 'space-y-2' : 'space-y-1'}>
      {sections.map((section, sectionIndex) => {
        const sectionId = `${idPrefix}-section-${sectionIndex}`;
        const sectionOpen = disclosures.openSections.has(sectionIndex) ||
          ((sectionIndex === activeSection || sectionIndex === fallbackSection) &&
            disclosures.closedActiveSection !== activeSectionKey &&
            !disclosures.openSections.has(sectionIndex));
        const hasActivePage = section.links.some((link) => linkIsActive(link, activePath));
        const entries = entriesForSection(section);

        return (
          <section key={`${section.title}-${sectionIndex}`} aria-labelledby={`${sectionId}-trigger`}>
            <button
              id={`${sectionId}-trigger`}
              type="button"
              onClick={() => toggleSection(sectionIndex, sectionOpen)}
              aria-expanded={sectionOpen}
              aria-controls={sectionId}
              className={sectionButtonClass}
            >
              <span className="flex min-w-0 items-center gap-1.5 truncate">
                <span className="truncate">{section.title}</span>
                {revealAll && section.title === 'Everything else' ? (
                  <Sparkles size={10} className="shrink-0 text-portal" aria-label="Revealed by Everything On" />
                ) : null}
                {hasActivePage && !sectionOpen ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-portal" aria-hidden="true" />
                ) : null}
              </span>
              <ChevronDown
                size={14}
                aria-hidden="true"
                className={`shrink-0 transition-transform duration-base ease-settle ${sectionOpen ? 'rotate-180' : ''}`}
              />
            </button>

            <div id={sectionId} className={sectionOpen ? 'space-y-1 pb-1' : 'hidden'}>
              {sectionOpen ? entries.map((entry) => {
                if (entry.kind === 'link') {
                  return (
                    <NavigationLink
                      key={entry.link.href}
                      link={entry.link}
                      activePath={activePath}
                      variant={variant}
                      entitlement={entitlement}
                      onNavigate={onNavigate}
                    />
                  );
                }

                const branchKey = `${sectionIndex}:${entry.key}`;
                const branchPanelId = `${sectionId}-group-${entry.key}`;
                const branchIsActive = activeBranchKey === `${activePath ?? ''}:${sectionIndex}:${entry.key}`;
                const branchOpen = disclosures.openBranches.has(branchKey) ||
                  (branchIsActive && disclosures.closedActiveBranch !== activeBranchKey);
                const branchHasActivePage = entry.children.some((link) => linkIsActive(link, activePath));

                return (
                  <div key={branchKey} className="space-y-1">
                    <div
                      className={`group flex items-center rounded-xl transition ${
                        branchHasActivePage ? 'bg-portal/[0.05]' : ''
                      }`}
                    >
                      <NavigationLink
                        link={entry.parent}
                        activePath={activePath}
                        variant={variant}
                        entitlement={entitlement}
                        onNavigate={onNavigate}
                        className="min-w-0 flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => toggleBranch(branchKey, branchOpen, branchIsActive)}
                        aria-label={entry.parent.label}
                        aria-expanded={branchOpen}
                        aria-controls={branchPanelId}
                        title={entry.parent.label}
                        className={`mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 ${
                          variant === 'mobile' ? 'h-10 w-10' : ''
                        }`}
                      >
                        <ChevronDown
                          size={14}
                          aria-hidden="true"
                          className={`transition-transform duration-base ease-settle ${branchOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </div>

                    <div id={branchPanelId} className={branchOpen ? 'ml-3 space-y-1 border-l border-stone-200 pl-2' : 'hidden'}>
                      {branchOpen ? entry.children.map((link) => (
                        <NavigationLink
                          key={link.href}
                          link={link}
                          activePath={activePath}
                          variant={variant}
                          entitlement={entitlement}
                          onNavigate={onNavigate}
                          nested
                        />
                      )) : null}
                    </div>
                  </div>
                );
              }) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function NavigationLink({
  link,
  activePath,
  variant,
  entitlement,
  onNavigate,
  nested = false,
  className = '',
}: {
  link: ResolvedNavLink;
  activePath: string | null;
  variant: Variant;
  entitlement: Parameters<typeof checkPlanAccess>[0];
  onNavigate?: () => void;
  nested?: boolean;
  className?: string;
}) {
  const Icon = link.icon;
  const active = linkIsActive(link, activePath);
  const open = linkAccessIsOpen(link, entitlement);
  const sizeClass = variant === 'mobile' ? 'min-h-11 px-3 py-2.5 text-sm' : 'px-3 py-2.5 text-sm';

  return (
    <Link
      href={link.href}
      prefetch={open}
      onClick={onNavigate}
      data-nav-active={active ? 'true' : undefined}
      data-press="soft"
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center gap-3 rounded-xl font-medium transition-all duration-base ease-settle ${sizeClass} ${nested ? (variant === 'mobile' ? 'min-h-11' : 'min-h-10') : ''} ${className} ${
        active
          ? 'bg-portal/10 text-portal ring-1 ring-inset ring-portal/25'
          : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-base ease-spring ${
          active
            ? 'bg-portal-gradient scale-105 text-white shadow-glow-sm'
            : 'bg-stone-50 text-stone-600 group-hover:scale-105 group-hover:text-stone-700'
        }`}
      >
        <Icon size={variant === 'mobile' ? 16 : 15} strokeWidth={2.2} />
      </span>
      <span className="min-w-0 truncate">{link.label}</span>
    </Link>
  );
}
