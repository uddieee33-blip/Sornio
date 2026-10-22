/** Platform operator only: run after independently verifying the payment. */
import { randomBytes, createHash } from 'node:crypto';
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[i+1]]);
  return pairs;
}, []));
args.reference = args.reference?.trim().toUpperCase();
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) throw new Error('Run in the platform server environment with SUPABASE_URL and a server-only Supabase secret/service-role key.');
if (!/^[a-f0-9-]{36}$/i.test(args.business || '') || !['growth','scale'].includes(args.plan) || !Number.isInteger(Number(args.months)) || Number(args.months)<1 || Number(args.months)>36 || !args.reference || args.reference.length<2 || args.reference.length>80)
  throw new Error('Usage: node scripts/mint-plan-key.mjs --business <uuid> --plan growth|scale --months 1-36 --reference <verified payment reference>');
const code = 'DKK1-'+randomBytes(32).toString('hex');
const response = await fetch(new URL('/rest/v1/plan_activation_keys', url), {
  method: 'POST',
  headers: { apikey: secret, ...(secret.startsWith('eyJ') ? { Authorization: `Bearer ${secret}` } : {}), 'content-type':'application/json', Prefer:'return=minimal' },
  body: JSON.stringify({ code_hash:createHash('sha256').update(code).digest('hex'), business_id:args.business, plan_id:args.plan, months:Number(args.months), payment_reference:args.reference, expires_at:new Date(Date.now()+30*86400000).toISOString() }),
});
if (!response.ok) throw new Error(`Key was not issued (${response.status}). Check the business, payment reference and server configuration; no code is usable until its database insert succeeds.`);
console.log(code);
