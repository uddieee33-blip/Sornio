import { ConsolePageSkeleton } from '@/components/ui/Skeleton';

/**
 * Route-level loading UI.
 *
 * Next.js renders this instantly on navigation while the target route's
 * JavaScript is still arriving, so a click never produces a blank screen or a
 * frozen page. The skeleton mirrors the console layout, which means the
 * content lands in exactly the space the placeholder occupied — no reflow.
 */
export default function ConsoleLoading() {
  return <ConsolePageSkeleton title="Loading this module" />;
}
