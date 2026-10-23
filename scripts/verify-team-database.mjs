#!/usr/bin/env node
/**
 * Tests the Team invitation transaction in an isolated, in-memory PostgreSQL
 * engine. It does not connect to Supabase, Vercel or customer data.
 * Real hosted PostgREST/Auth and simultaneous-device staging checks remain
 * mandatory before production migration.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261023030000_team_atomic_invitations.sql'), 'utf8');
const route = readFileSync(join(process.cwd(), 'app/api/team/redeem/route.ts'), 'utf8');

assert.match(sql, /SECURITY INVOKER/, 'Transaction must not bypass invoker privileges');
assert.match(sql, /FOR UPDATE/, 'Invite consumption requires a row lock');
assert.match(sql, /pg_advisory_xact_lock/, 'Different invitations for the same user must serialize');
assert.match(sql, /REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC, anon, authenticated/, 'RPC must not be callable from browser credentials');
assert.match(route, /getSessionUser\(\)/, 'User identity must be verified by the auth provider');
assert.match(route, /admin\.rpc\('redeem_team_invite_atomic'/, 'The server must use the atomic RPC');
assert.doesNotMatch(route, /\.from\('team_invites'\)\.update\(/, 'The API must not burn invites in a second transaction');

const db = new PGlite();
const users = {
  owner: '00000000-0000-0000-0000-000000000001',
  joined: '00000000-0000-0000-0000-000000000002',
  outsider: '00000000-0000-0000-0000-000000000003',
  other: '00000000-0000-0000-0000-000000000004',
  broken: '00000000-0000-0000-0000-000000000005',
  guest: '00000000-0000-0000-0000-000000000006',
};
const b1 = '11111111-1111-1111-1111-111111111111';
const b2 = '22222222-2222-2222-2222-222222222222';
const hash = (char) => char.repeat(64);

await db.exec(`
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE TABLE public.businesses(id UUID PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE public.business_members(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id),
    user_id UUID NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner','manager','accountant','staff','viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(business_id,user_id)
  );
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_members TO service_role;
  INSERT INTO public.businesses VALUES
    ('${b1}', 'Business A'), ('${b2}', 'Business B');
`);
await db.exec(sql);

async function redeem(user, code) {
  await db.exec('BEGIN');
  try {
    await db.exec('SET LOCAL ROLE service_role');
    const result = await db.query(
      'SELECT public.redeem_team_invite_atomic($1,$2) AS result',
      [code, user],
    );
    await db.exec('COMMIT');
    return result.rows[0].result;
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}
async function invite(code, business, role='staff', expired=false, revoked=false) {
  await db.query(
    `INSERT INTO public.team_invites(business_id,role,code_hash,expires_at,revoked_at)
     VALUES($1,$2,$3,now() + (CASE WHEN $4 THEN -1 ELSE 3 END)*interval '1 day',
            CASE WHEN $5 THEN now() ELSE NULL END)`,
    [business, role, code, expired, revoked],
  );
}
const count = async (where, values=[]) =>
  (await db.query(`SELECT count(*)::int AS c FROM public.business_members WHERE ${where}`, values)).rows[0].c;

assert.equal((await redeem(users.joined, hash('f'))).status, 'invalid', 'Unknown code denied');
await invite(hash('a'), b1);
assert.equal((await redeem(users.joined, hash('a'))).status, 'joined', 'Join succeeds');
assert.equal(await count('user_id=$1', [users.joined]), 1, 'One membership created');
assert.equal((await redeem(users.outsider, hash('a'))).status, 'invalid', 'Consumed code cannot be reused');
const redeemedRow = (await db.query('SELECT used_at,used_by FROM public.team_invites WHERE code_hash=$1', [hash('a')])).rows[0];
assert(redeemedRow.used_at, 'Invite burned');
assert.equal(redeemedRow.used_by, users.joined, 'Invite consumed by its actual user');

await invite(hash('b'), b1, 'manager');
assert.equal((await redeem(users.joined, hash('b'))).status, 'already-member', 'Existing teammate cannot rejoin');
await invite(hash('c'), b2);
assert.equal((await redeem(users.joined, hash('c'))).status, 'already-assigned', 'User cannot join another business');
assert.equal((await db.query('SELECT used_at FROM public.team_invites WHERE code_hash=$1', [hash('c')])).rows[0].used_at, null, 'Refused join preserves unused code');

await invite(hash('d'), b2, 'staff', true);
await invite(hash('e'), b2, 'staff', false, true);
assert.equal((await redeem(users.other, hash('d'))).status, 'invalid', 'Expired invite denied');
assert.equal((await redeem(users.other, hash('e'))).status, 'invalid', 'Revoked invite denied');

await invite(hash('1'), b1);
await invite(hash('2'), b2);
assert.equal((await redeem(users.guest, hash('1'))).status, 'joined', 'First invite accepted');
assert.equal((await redeem(users.guest, hash('2'))).status, 'already-assigned', 'Second invite to another business denied');

await db.exec(`
  CREATE FUNCTION public.reject_test_join() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF NEW.user_id = '${users.broken}'::uuid THEN
      RAISE EXCEPTION 'simulated membership failure';
    END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER reject_test_join BEFORE INSERT ON public.business_members
  FOR EACH ROW EXECUTE FUNCTION public.reject_test_join();
`);
await invite(hash('3'), b2);
await assert.rejects(redeem(users.broken, hash('3')), /simulated membership failure/);
assert.equal(await count('user_id=$1', [users.broken]), 0, 'Failed transaction must not leave a membership');
assert.equal((await db.query('SELECT used_at FROM public.team_invites WHERE code_hash=$1', [hash('3')])).rows[0].used_at, null, 'Failed transaction must not burn code');

await db.exec('BEGIN');
let unauthorized = false;
try {
  await db.exec('SET LOCAL ROLE authenticated');
  await db.query('SELECT public.redeem_team_invite_atomic($1,$2)', [hash('c'), users.outsider]);
} catch {
  unauthorized = true;
}
await db.exec('ROLLBACK');
assert(unauthorized, 'Direct browser role cannot execute service-only RPC');

await db.close();
console.log('Team database: isolated RPC, one-time use, roles, rollback and authorization checks passed.');
