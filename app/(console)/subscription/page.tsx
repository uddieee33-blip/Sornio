import { SubscriptionView } from '@/components/billing/subscription-view';

/**
 * Your Plan — server entry.
 *
 * The route itself does one job: resolve `?locked=<module>` from the URL on the
 * server, so a business that was just refused a paid module reads *why* in the
 * first paint rather than watching an explanation fade in after hydration. That
 * is the same discipline as the console layout resolving the portal from its
 * cookie — decide on the server, render the decision.
 */
export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const locked = typeof params.locked === 'string' ? params.locked : null;
  return <SubscriptionView lockedModule={locked} />;
}
