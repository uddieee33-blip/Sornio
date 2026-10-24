'use client';

/**
 * The console's first screen.
 *
 * It renders the cockpit of whichever portal the business is on — a gym sees
 * the floor and its renewals, a kirana sees the counter and its khata, a café
 * sees covers and the pantry. All of that lives in the blueprint (lib/portals),
 * so this page stays a one-line composition rather than a pile of conditionals.
 */

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { SimpleHome } from '@/components/cockpit/simple-home';

const PortalCockpit = dynamic(() => import('@/components/cockpit/portal-cockpit').then((loaded) => loaded.PortalCockpit));

export default function HomePage() {
  const [details, setDetails] = useState(false);
  if (!details) return <SimpleHome onDetails={() => setDetails(true)} />;
  return <><div className="px-4 pt-4 sm:px-6"><button type="button" onClick={() => setDetails(false)} className="min-h-11 rounded-xl border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-700">Back to daily work</button></div><PortalCockpit /></>;
}
