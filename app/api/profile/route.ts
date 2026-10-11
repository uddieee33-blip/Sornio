/**
 * The owner profile endpoint — the reason "Welcome back" can mean something.
 *
 *   GET → the profile this signed-in owner last saved, or `null` if they never
 *         have. This is what fills the setup screen on a device that has no
 *         vault of its own: a second phone, a reinstalled PWA, a cleared
 *         browser.
 *   PUT → save it. One row per business, upserted.
 *
 * Why this is a server route and not a browser Supabase call:
 *
 *   • **The tenant is decided here.** The business id comes from
 *     `business_members` for `auth.uid()`, never from the request body, so a
 *     client cannot aim a profile at somebody else's business by editing a
 *     fetch.
 *   • **The payload is validated here.** `parseProfilePayload` is an allow-list
 *     of eleven fields with the same limits the browser used. A body that adds
 *     keys, or that ships a UPI id that is not a VPA, is corrected or refused
 *     rather than stored.
 *   • **`setup_complete` is derived here.** A client that claims to have
 *     finished setup while sending no UPI id gets `false` written anyway, which
 *     is what stops the sign-in screen from skipping setup it has not seen.
 *
 * Local-first honesty: with placeholder Supabase credentials there is no
 * database to remember anything in, and saying so is the whole answer. GET
 * replies `mode: 'local'` with a `null` profile — the device's own encrypted
 * vault is still the record, and the setup screen prefills from it. PUT replies
 * `ok: false` with the reason rather than pretending to have saved.
 *
 * Hardening inherited from the edge (restated so a refactor cannot drop it):
 * CSRF double-submit on the PUT, origin + fetch-metadata checks, and its own
 * `profile` rate bucket in `lib/security/policy.json`.
 */

import { NextResponse } from 'next/server';

import { currentIdentity } from '@/lib/auth/identity';
import { getGuardedServerClient, getSessionUser } from '@/lib/security/guard';
import { isKnownTemplateId } from '@/lib/portals/registry';
import { parseProfilePayload, rowFromSnapshot, type ProfileSnapshot } from '@/lib/sync/profile';
import { readStoredProfile } from '@/lib/sync/profile-server';

/** A profile is eleven short fields; anything larger is not a profile. */
const MAX_BODY_BYTES = 8 * 1024;

/** Who may reroute the shop's collection details — same set as the portal switch. */
const PROFILE_WRITE_ROLES = new Set(['owner', 'manager']);

function json(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  return response;
}

type ServerClient = NonNullable<Awaited<ReturnType<typeof getGuardedServerClient>>>;

/** The business this user belongs to, or null when they have none yet. */
async function businessIdFor(client: ServerClient, userId: string): Promise<string | null> {
  const { data, error } = await client
    .from('business_members')
    .select('business_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data?.business_id) return null;
  return String(data.business_id);
}

/**
 * The business to save against, provisioning it if this is the owner's first.
 *
 * Two rows that each need the other to exist first is why `businesses.owner_id`
 * carries the insert policy (see Increment 10 in `supabase/schema.sql`): the
 * business is created as owned by this user, then the membership row that every
 * RLS policy in this schema reads. A failure at either step is returned, never
 * swallowed — an owner who is told "saved" and finds an empty console next time
 * has been lied to.
 */
async function ensureBusiness(
  client: ServerClient,
  userId: string,
  snapshot: ProfileSnapshot,
): Promise<{ id: string } | { error: string }> {
  const existing = await businessIdFor(client, userId);
  if (existing) return { id: existing };

  /*
   * The id is minted here, and the insert deliberately does *not* chain
   * `.select('id')`.
   *
   * That chain is the shape everybody reaches for, and under row-level security
   * it is a trap: Postgres serves the `RETURNING` row through the table's SELECT
   * policies, and the SELECT policy on `businesses` asks for a membership row —
   * the one row that cannot exist yet, because its foreign key points at the
   * business being inserted. The insert succeeds, the read comes back empty, and
   * the owner is told their profile could not be saved on the one request that
   * was supposed to set them up. Minting the id keeps the two writes independent
   * and needs nothing read back.
   */
  const businessId = crypto.randomUUID();

  const { error: businessError } = await client.from('businesses').insert({
    id: businessId,
    name: snapshot.businessName || 'My Business',
    owner_id: userId,
    business_type: snapshot.templateId || null,
    description: snapshot.description || null,
    currency: snapshot.currency || 'INR',
    timezone: snapshot.timezone || 'Asia/Kolkata',
  });
  if (businessError) return { error: businessError.message };

  const { error: memberError } = await client
    .from('business_members')
    .insert({ business_id: businessId, user_id: userId, role: 'owner' });
  if (memberError) return { error: memberError.message };

  return { id: businessId };
}

export async function GET() {
  const identity = await currentIdentity();
  if (!identity) return json({ ok: false, error: 'Sign in required.' }, 401);

  const stored = await readStoredProfile();
  if (stored.mode === 'local') {
    // Not an error: this deployment has no database, and the device's own
    // encrypted vault is the record. The caller needs to be able to tell that
    // apart from "signed in, nothing saved yet".
    return json({
      ok: true,
      mode: 'local',
      profile: null,
      note: 'This build has no account storage — the profile lives in this device’s encrypted vault.',
    });
  }

  return json({ ok: true, mode: 'supabase', businessId: stored.businessId, profile: stored.profile });
}

export async function PUT(request: Request) {
  const identity = await currentIdentity();
  if (!identity) return json({ ok: false, error: 'Sign in required.' }, 401);
  if (!PROFILE_WRITE_ROLES.has(identity.role)) {
    // The UPI id on this profile is where the shop's money lands. A cashier who
    // could rewrite it could redirect every collection, so the refusal is flat
    // and the reason is the truth.
    return json({ ok: false, error: 'Only the owner or a manager can change these details.' }, 403);
  }

  const client = await getGuardedServerClient();
  if (!client) {
    return json({
      ok: false,
      mode: 'local',
      error: 'This build has no account storage — the profile lives in this device’s encrypted vault.',
    }, 501);
  }

  const user = await getSessionUser();
  if (!user) return json({ ok: false, error: 'Sign in required.' }, 401);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: 'Request body is too large.' }, 413);

  let payload: unknown;
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    return json({ ok: false, error: 'Expected a JSON body.' }, 400);
  }

  const parsed = parseProfilePayload(payload, { isKnownTemplateId });
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 422);
  const snapshot = parsed.snapshot;

  const business = await ensureBusiness(client, user.id, snapshot);
  if ('error' in business) return json({ ok: false, error: 'Could not save the profile.' }, 500);

  // The tenant row keeps the name the profile carries, so the businesses table
  // and the profile can never disagree about what the shop is called.
  await client
    .from('businesses')
    .update({
      name: snapshot.businessName || 'My Business',
      business_type: snapshot.templateId || null,
      description: snapshot.description || null,
      currency: snapshot.currency || 'INR',
      timezone: snapshot.timezone || 'Asia/Kolkata',
      updated_at: new Date().toISOString(),
    })
    .eq('id', business.id);

  const { error } = await client
    .from('owner_profiles')
    .upsert({ business_id: business.id, user_id: user.id, ...rowFromSnapshot(snapshot) }, { onConflict: 'business_id' });
  if (error) return json({ ok: false, error: 'Could not save the profile.' }, 500);

  return json({ ok: true, mode: 'supabase', businessId: business.id, profile: snapshot });
}
