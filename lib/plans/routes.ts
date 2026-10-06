/**
 * Plan route policy — the enforcement half of the paid product.
 *
 * A paywall that is only drawn in the UI is a suggestion. This module makes the
 * plan a *routing* decision, applied before the page is rendered, and it is
 * deliberately the same shape as the portal system next to it:
 *
 *   • `middleware.ts`            — refuses a module this plan does not carry.
 *   • `usePlan()` (client)       — tells the owner the truth about why.
 *
 * Two rules keep it safe to run on every request:
 *
 *   1. **Locking can only ever hide a module, never grant one.** The list of
 *      always-open modules (ledger, audit, settings, security, billing of
 *      ourselves) is added on top of whatever a plan carries, and a locked
 *      module is only ever refused — there is no code path here that could open
 *      something the security layer would otherwise deny.
 *   2. **A lapsed plan is not a locked shop.** Expiry drops a business to the
 *      free plan, which still records sales, takes cash, prints bills and keeps
 *      every record. Only the paid automation pauses.
 *
 * Pure data: safe to import from Edge middleware.
 */

import { moduleForPath, moduleLabelFor } from '@/lib/portals/routes';
import { entryForModule, MODULE_CATALOGUE } from '@/lib/portals/catalogue';
import { portalById } from '@/lib/portals/registry';
import type { ModuleKey } from '@/lib/portals/types';
import { entitlementHasModule } from './lifecycle';
import type { Entitlement } from './types';

/** Where a locked module sends the owner: the page that can unlock it. */
export const UPGRADE_PATH = '/subscription';

/** Query flag used when a link points at a module this plan does not carry. */
export const PLAN_LOCKED_PARAM = 'locked';

export type PlanAccessVerdict =
  | { allowed: true }
  | { allowed: false; module: ModuleKey; label: string; redirectTo: string };

/**
 * May this entitlement open this path?
 *
 * Only ever evaluated for console routes (`moduleForPath` returns null for
 * everything else, including the landing page, auth, onboarding and every API
 * route — a write is never redirected, so this can never mask a failed action).
 */
export function checkPlanAccess(entitlement: Entitlement, pathname: string): PlanAccessVerdict {
  const moduleKey = moduleForPath(pathname);
  if (!moduleKey) return { allowed: true };
  if (entitlementHasModule(entitlement, moduleKey)) return { allowed: true };
  return {
    allowed: false,
    module: moduleKey,
    label: entryForModule(moduleKey).label,
    redirectTo: `${UPGRADE_PATH}?${PLAN_LOCKED_PARAM}=${moduleKey}`,
  };
}

/**
 * What is this business missing *for the console it actually runs*?
 *
 * A gym never sees "inventory is locked" because a gym does not carry
 * inventory at all — only modules the portal includes and the plan does not are
 * reported, in the portal's own words.
 */
export function lockedModulesFor(entitlement: Entitlement, portalId: unknown): { module: ModuleKey; label: string }[] {
  if (entitlement.modules === 'all') return [];
  const portal = portalById(portalId);
  const seen = new Set<ModuleKey>();
  const locked: { module: ModuleKey; label: string }[] = [];
  for (const section of portal.nav) {
    for (const link of section.links) {
      const moduleKey = moduleForPath(link.href);
      if (!moduleKey || seen.has(moduleKey)) continue;
      seen.add(moduleKey);
      if (entitlementHasModule(entitlement, moduleKey)) continue;
      locked.push({ module: moduleKey, label: moduleLabelFor(portalId, moduleKey) });
    }
  }
  return locked;
}

/**
 * The module a `?locked=` flag refers to, or null when it is absent or bogus.
 * The flag names a *module*, not a path, so it is matched against the
 * catalogue rather than run through `moduleForPath`.
 */
export function lockedModuleFromParam(value: string | null | undefined): ModuleKey | null {
  if (!value) return null;
  const key = value.replace(/^\//, '');
  return MODULE_CATALOGUE.some((entry) => entry.module === key) ? (key as ModuleKey) : null;
}
