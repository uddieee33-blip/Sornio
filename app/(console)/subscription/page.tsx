import { SubscriptionView } from '@/components/billing/subscription-view';
import { getGuardedServerClient, getSessionUser } from '@/lib/security/guard';
import { isPlatformOperator } from '@/lib/plans/platform-policy';
import { isValidUpiId } from '@/lib/upi';

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
  const user = await getSessionUser();
  const client = user ? await getGuardedServerClient() : null;
  const membership = client && user ? await client.from('business_members').select('business_id').eq('user_id', user.id).limit(1).maybeSingle() : null;
  return <SubscriptionView lockedModule={locked} businessId={membership?.data?.business_id ?? null}
    initialPlan={typeof params.plan === 'string' ? params.plan : null}
    initialInterval={typeof params.interval === 'string' ? params.interval : null}
    operator={isPlatformOperator(user?.id, process.env.DUKAANOS_PLATFORM_ADMIN_IDS ?? '')}
    checkoutReady={isValidUpiId((process.env.NEXT_PUBLIC_PLANS_UPI_ID ?? '').trim())} />;
}

