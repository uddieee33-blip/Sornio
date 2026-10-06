/**
 * Portal registry — resolution and validation.
 *
 * Everything that needs to know "which portal is this business?" goes through
 * here, so there is exactly one answer in the codebase. Pure module: Edge-safe.
 */

import { CORE_MODULES, entryForHref, MODULE_CATALOGUE } from './catalogue';
import { DEFAULT_PORTAL_ID, PORTAL_BLUEPRINTS } from './blueprints';
import type { CaptureChannel, ModuleKey, PortalBlueprint, PortalCapture, PortalId } from './types';

const BY_ID = new Map<PortalId, PortalBlueprint>(PORTAL_BLUEPRINTS.map((portal) => [portal.id, portal]));
const BY_TEMPLATE = new Map<string, PortalBlueprint>(PORTAL_BLUEPRINTS.map((portal) => [portal.templateId, portal]));

export const PORTALS: PortalBlueprint[] = PORTAL_BLUEPRINTS;
export const PORTAL_IDS: PortalId[] = PORTAL_BLUEPRINTS.map((portal) => portal.id);

/** Narrowing check for anything that arrives from a cookie, URL, or import. */
export function isPortalId(value: unknown): value is PortalId {
  return typeof value === 'string' && (PORTAL_IDS as string[]).includes(value);
}

/**
 * The blueprint for a portal id. Unknown ids resolve to the general portal
 * rather than throwing: a stale cookie or an exported file from an older
 * version must never lock an owner out of their own console.
 */
export function portalById(id: unknown): PortalBlueprint {
  return (isPortalId(id) ? BY_ID.get(id) : undefined) ?? BY_ID.get(DEFAULT_PORTAL_ID)!;
}

/**
 * The blueprint a business is on, from its stored template id.
 * An empty template (setup not finished) resolves to the general portal.
 */
export function portalForTemplate(templateId: string | null | undefined): PortalBlueprint {
  if (!templateId) return portalById(DEFAULT_PORTAL_ID);
  return BY_TEMPLATE.get(templateId) ?? portalById(DEFAULT_PORTAL_ID);
}

/** True when the business has not committed to a portal yet. */
export function needsPortalChoice(templateId: string | null | undefined): boolean {
  return !templateId || !BY_TEMPLATE.has(templateId);
}

/** Every module this portal switches on, core modules included, deduped. */
export function enabledModules(id: unknown): ModuleKey[] {
  const portal = portalById(id);
  return Array.from(new Set<ModuleKey>([...CORE_MODULES, ...portal.modules]));
}

/** Fast lookup used on every navigation: is this module live for this portal? */
export function portalHasModule(id: unknown, module: ModuleKey): boolean {
  if (CORE_MODULES.includes(module)) return true;
  return portalById(id).modules.includes(module);
}

export function isModuleEnabled(id: unknown, href: string): boolean {
  const entry = entryForHref(href);
  if (!entry) return false;
  return portalHasModule(id, entry.module);
}

/** Modules this portal deliberately leaves out — surfaced in the UI, honestly. */
export function disabledModules(id: unknown): { module: ModuleKey; label: string; href: string }[] {
  const portal = portalById(id);
  return MODULE_CATALOGUE.filter(
    (entry) => !entry.core && !portal.modules.includes(entry.module),
  ).map((entry) => ({ module: entry.module, label: entry.label, href: entry.href }));
}

/** The template id used by onboarding / business setup for a portal. */
export function templateIdForPortal(id: unknown): string {
  return portalById(id).templateId;
}

/**
 * How this trade reads a code or a finger at its desk.
 *
 * The screens read this instead of hard-coding "gyms have a fingerprint pad":
 * the `/check-ins` kiosk appears because the blueprint says the trade uses a
 * fingerprint, and the `/scan` station explains what this trade scans and why
 * the other channels were left out.
 */
export function captureForPortal(id: unknown): PortalCapture {
  return portalById(id).capture;
}

/** Every channel any shipped trade uses — for the setup and trust screens. */
export const ALL_CAPTURE_CHANNELS: CaptureChannel[] = ['barcode', 'qr', 'fingerprint', 'keypad'];

/** Does this trade use a channel at all? Cheap, and reads well at the call site. */
export function portalUsesChannel(id: unknown, channel: CaptureChannel): boolean {
  return captureForPortal(id).channels.includes(channel);
}

/** The scan station is a module like any other: the edge enforces it either way. */
export function portalScans(id: unknown): boolean {
  return portalHasModule(id, 'scan');
}

/** Human labels for a portal's modules, in this trade's words (setup screen). */
export function moduleLabels(id: unknown): string[] {
  const portal = portalById(id);
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const section of portal.nav) {
    for (const link of section.links) {
      const label = link.label ?? entryForHref(link.href)?.label ?? link.href;
      if (seen.has(label)) continue;
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}

/** Is this one of the template ids we ship? (Wire-format validation.) */
export function isKnownTemplateId(value: unknown): boolean {
  return typeof value === 'string' && BY_TEMPLATE.has(value);
}

/**
 * Server-side resolution: from a template id on the wire, decide the portal.
 * Unknown input resolves to the general portal, never an error — a stale client
 * must not be able to lock a business out of its own console.
 */
export function portalIdForTemplate(templateId: unknown): PortalId {
  return portalForTemplate(typeof templateId === 'string' ? templateId : null).id;
}
