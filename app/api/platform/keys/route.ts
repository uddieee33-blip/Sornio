import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { platformOperator } from '@/lib/plans/platform-server';
import { validateKeyRequest } from '@/lib/plans/platform-policy';
import { getServiceRoleClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' } });
}

export async function GET(request: Request) {
  // Authorise before constructing any privileged client or fetching tenant records.
  if (!await platformOperator()) return json({ error: 'Platform administrator access required.' }, 403);
  const client = getServiceRoleClient();
  if (!client) return json({ error: 'Key issuance needs the server service-role credential configured.' }, 503);
  const businessId = new URL(request.url).searchParams.get('business');
  if (!businessId || !/^[a-f0-9-]{36}$/i.test(businessId)) return json({ error: 'Enter a business ID.' }, 422);
  try {
    const business = await client.from('businesses').select('id,name,status').eq('id', businessId).maybeSingle();
    if (business.error) return json({ error: 'Could not read the business.' }, 503);
    if (!business.data) return json({ error: 'Business not found.' }, 404);
    const keys = await client.from('plan_activation_keys')
      .select('plan_id,months,payment_reference,created_at,expires_at,redeemed_at')
      .eq('business_id', businessId).order('created_at', { ascending: false }).limit(25);
    if (keys.error) return json({ error: 'Could not read key history.' }, 503);
    return json({ business: business.data, keys: keys.data });
  } catch { return json({ error: 'Could not reach plan storage. Try again.' }, 503); }
}

export async function POST(request: Request) {
  const operator = await platformOperator();
  if (!operator) return json({ error: 'Platform administrator access required.' }, 403);
  // The proxy also enforces origin, CSRF double-submit, and rate limits.
  const raw = await request.text();
  if (raw.length > 2048) return json({ error: 'Request too large.' }, 413);
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return json({ error: 'Expected a JSON body.' }, 400); }
  const input = validateKeyRequest(payload);
  if (!input) return json({ error: 'Choose a business, a paid plan, a supported period, and a verified bank reference. Confirm that you checked the payment.' }, 422);
  const client = getServiceRoleClient();
  if (!client) return json({ error: 'Key issuance needs the server service-role credential configured.' }, 503);
  try {
    const business = await client.from('businesses').select('id,name,status').eq('id', input.businessId).maybeSingle();
    if (business.error) return json({ error: 'Could not verify the business.' }, 503);
    if (!business.data || business.data.status !== 'active') return json({ error: 'Choose an active business.' }, 422);
    const code = 'DKK1-' + randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    const result = await client.from('plan_activation_keys').insert({
      code_hash: createHash('sha256').update(code).digest('hex'),
      business_id: input.businessId, plan_id: input.planId, months: input.months,
      payment_reference: input.reference, expires_at: expiresAt,
    });
    if (result.error) return json({ error: result.error.code === '23505'
      ? 'That payment reference already has a key. Check its history; another key was not issued.'
      : 'The key was not issued. Check the business and server configuration before retrying.' }, result.error.code === '23505' ? 409 : 503);
    // A code is returned only after its digest was saved; never log or store the raw code.
    return json({ code, business: business.data, expiresAt, planId: input.planId, months: input.months, reference: input.reference }, 201);
  } catch { return json({ error: 'Key issuance could not be confirmed. Check history before retrying.' }, 503); }
}
