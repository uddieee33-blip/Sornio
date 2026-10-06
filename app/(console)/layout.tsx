import { cookies } from 'next/headers';
import { ConsoleShell } from '@/components/layout/console-shell';
import { isPortalId } from '@/lib/portals/registry';
import { PORTAL_COOKIE } from '@/lib/portals/routes';
import type { PortalId } from '@/lib/portals/types';

/**
 * Console layout.
 *
 * The portal cookie is read *here*, on the server, and handed to the shell as
 * the starting value. That gives two things at once:
 *
 *   1. **No flicker and no layout shift** — the first paint already carries the
 *      right navigation for this business, instead of showing a full menu and
 *      then collapsing it once the store hydrates.
 *   2. **A single source of truth** — the same validated cookie decides which
 *      routes Edge middleware will serve (see `lib/portals/routes.ts`), so what
 *      the owner sees and what the server enforces cannot drift apart.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(PORTAL_COOKIE)?.value;
  const initialPortalId: PortalId | null = isPortalId(raw) ? raw : null;

  return <ConsoleShell initialPortalId={initialPortalId}>{children}</ConsoleShell>;
}
