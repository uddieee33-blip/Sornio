/**
 * Portal navigation builder.
 *
 * Turns a blueprint's nav declaration into real links: canonical icons, this
 * trade's labels, and the full search keywords for ⌘K (canonical keywords plus
 * the words the owner would actually type).
 */

import { entryForHref, MODULE_CATALOGUE } from './catalogue';
import { portalIcon } from './icons';
import { portalForTemplate } from './registry';
import type { ModuleKey, PortalBlueprint, PortalNavSection } from './types';
import type { LucideIcon } from 'lucide-react';

export type ResolvedNavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  module: ModuleKey;
  keywords: string;
};

export type ResolvedNavSection = {
  title: string;
  links: ResolvedNavLink[];
};

export function resolveNav(portal: PortalBlueprint): ResolvedNavSection[] {
  return portal.nav.map((section: PortalNavSection) => ({
    title: section.title,
    links: section.links.flatMap((link) => {
      const entry = entryForHref(link.href);
      if (!entry) return [];
      return [
        {
          href: link.href,
          label: link.label ?? entry.label,
          icon: portalIcon(link.icon ?? entry.icon),
          module: entry.module,
          keywords: `${entry.label} ${entry.keywords} ${link.keywords ?? ''}`.trim(),
        },
      ];
    }),
  }));
}

/** Canonical label for a route, used when no portal context is available. */
export function canonicalLabel(href: string): string {
  return entryForHref(href)?.label ?? href;
}

/** Every module key in catalogue order — handy for the trust/setup screens. */
export function allModuleKeys(): ModuleKey[] {
  return MODULE_CATALOGUE.map((entry) => entry.module);
}

/** Sections for the business on this template id (store-side convenience). */
export function navSectionsFor(templateId: string | null | undefined): ResolvedNavSection[] {
  return resolveNav(portalForTemplate(templateId));
}
