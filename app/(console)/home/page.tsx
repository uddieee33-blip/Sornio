'use client';

/**
 * The console's first screen.
 *
 * It renders the cockpit of whichever portal the business is on — a gym sees
 * the floor and its renewals, a kirana sees the counter and its khata, a café
 * sees covers and the pantry. All of that lives in the blueprint (lib/portals),
 * so this page stays a one-line composition rather than a pile of conditionals.
 */

import { PortalCockpit } from '@/components/cockpit/portal-cockpit';

export default function HomePage() {
  return <PortalCockpit />;
}
