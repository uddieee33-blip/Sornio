import { cookies } from 'next/headers';
import { ConsoleShell } from '@/components/layout/console-shell';
import { isPortalId } from '@/lib/portals/registry';
import { PORTAL_COOKIE } from '@/lib/portals/routes';
import { MASTER_COOKIE, masterDaysLeft, masterRevealActive, openMasterRecord } from '@/lib/portals/master';
import type { PortalId } from '@/lib/portals/types';

/**
 * Console layout.
 *
 * Two cookies are read *here*, on the server, and handed to the shell as its
 * starting values. That gives two things at once:
 *
 *   1. **No flicker and no layout shift** — the first paint already carries the
 *      right navigation for this business, instead of showing a full menu and
 *      then collapsing it once the store hydrates.
 *   2. **A single source of truth** — the same validated cookies decide which
 *      routes Edge middleware will serve (see `lib/portals/routes.ts` and
 *      `lib/portals/master.ts`), so what the owner sees and what the server
 *      enforces cannot drift apart.
 *
 * The portal cookie is read as a plain value because it can only ever *hide* a
 * module. The Everything On cookie is opened through its HMAC, because it
 * reveals — and an unverifiable reveal is treated as no reveal at all.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();

  const raw = cookieStore.get(PORTAL_COOKIE)?.value;
  const initialPortalId: PortalId | null = isPortalId(raw) ? raw : null;

  const master = await openMasterRecord(cookieStore.get(MASTER_COOKIE)?.value);
  const revealAll = masterRevealActive(master);

  return (
    <ConsoleShell
      initialPortalId={initialPortalId}
      initialRevealAll={revealAll}
      initialRevealDaysLeft={masterDaysLeft(master)}
    >
      {children}
    </ConsoleShell>
  );
}
