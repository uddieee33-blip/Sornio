'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** The store and navigation stay mounted; only the new page enters. */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div key={pathname} className="console-route-enter">{children}</div>;
}
