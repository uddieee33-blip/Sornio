#!/usr/bin/env node

/**
 * Static release guards for the Team API.
 *
 * API authorization still needs integration tests against real Supabase Auth
 * and PostgREST. These assertions protect the fail-closed invariants against
 * a future refactor that removes essential query checks.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'app/api/team/route.ts'), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `Missing Team section: ${start}`);
  const to = end ? source.indexOf(end, from + start.length) : source.length;
  assert.notEqual(to, -1, `Missing section terminator: ${end}`);
  return source.slice(from, to);
};

const read = section('export async function GET(', 'export async function POST(');
const create = section("case 'invite':", "case 'revoke':");
const revoke = section("case 'revoke':", "case 'remove':");
const remove = section("case 'remove':", "case 'role':");
const role = section("case 'role':", '    default:');

assert.match(read, /businessResult\.error\s*\|\|\s*memberResult\.error\s*\|\|\s*inviteResult\.error/, 'Roster errors must be checked');
assert.match(read, /if\s*\(businessResult\.error[\s\S]*?return respond\(\{ ok: false/, 'Roster query failure must be returned as failure');
assert.match(create, /countError\s*\|\|\s*count === null/, 'Invite count errors must fail closed');
assert.match(revoke, /\.is\('used_at', null\)[\s\S]*?\.is\('revoked_at', null\)/, 'Only unused/unrevoked invitations can be revoked');
assert.match(revoke, /if \(!revoked\) return respond\(\{ ok: false/, 'Revoking a nonexistent invitation must not report success');
assert.match(remove, /targetRole === 'owner'/, 'Owner removal must be refused');
assert.match(remove, /\.neq\('role', 'owner'\)[\s\S]*?\.select\('user_id'\)/, 'Removal query must enforce owner protection atomically');
assert.match(remove, /if \(!removed\) return respond\(\{ ok: false/, 'No-op remove must not claim success');
assert.match(role, /targetRole === 'owner'/, 'Owner demotion must be refused');
assert.match(role, /\.neq\('role', 'owner'\)[\s\S]*?\.select\('user_id'\)/, 'Role update must enforce owner protection atomically');
assert.match(role, /if \(!updated\) return respond\(\{ ok: false/, 'No-op role update must not claim success');

console.log('Team API: 11 fail-closed roster, invitation and owner-seat checks passed.');
