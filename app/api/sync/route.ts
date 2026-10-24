import { NextResponse } from 'next/server';
import { getGuardedServerClient, getSessionUser } from '@/lib/security/guard';
import { COLLECTIONS, validRecord, type OperatingRecord } from '@/lib/sync/records';
const MAX_BYTES = 8 * 1024 * 1024;
function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}
async function context() {
  const client = await getGuardedServerClient();
  const user = await getSessionUser();
  return client && user ? { client, user } : null;
}
async function boundedBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return {};
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error('body too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(joined));
}
export async function GET() {
  const ctx = await context();
  if (!ctx) return json({ ok: false, error: 'Sign in required.' }, 401);
  const { data, error } = await ctx.client.rpc('read_operating_snapshot');
  if (error)
    return json(
      {
        ok: false,
        error: 'Cloud storage is not ready. Apply the Sornio reliability migration before syncing.',
      },
      503,
    );
  return json({ ok: true, snapshot: data });
}
async function mutate(request: Request, reset: boolean) {
  const ctx = await context();
  if (!ctx) return json({ ok: false, error: 'Sign in required.' }, 401);
  let payload: unknown;
  try {
    payload = await boundedBody(request);
  } catch {
    return json({ ok: false, error: 'Invalid or oversized sync request.' }, 413);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return json({ ok: false, error: 'Invalid business records.' }, 422);
  const p = payload as { generation?: unknown; changes?: unknown };
  if (!Number.isInteger(p.generation) || Number(p.generation) < 0)
    return json({ ok: false, error: 'Restore the business before uploading.' }, 422);
  if (
    !reset &&
    (!Array.isArray(p.changes) ||
      p.changes.length > 100000 ||
      p.changes.some((x: unknown) => {
        const row = x as {
          kind?: string;
          id?: string;
          data?: unknown;
          revision?: unknown;
        };
        return (
          !row ||
          ![...COLLECTIONS, 'settings'].includes(row.kind as never) ||
          typeof row.id !== 'string' ||
          row.id.length > 160 ||
          !row.data ||
          typeof row.data !== 'object' ||
          Array.isArray(row.data) ||
          !Number.isInteger(row.revision) ||
          Number(row.revision) < 0 ||
          !validRecord(row as OperatingRecord)
        );
      }))
  )
    return json({ ok: false, error: 'Invalid business records.' }, 422);
  const { data, error } = await ctx.client.rpc(
    reset ? 'reset_operating_records' : 'sync_operating_records',
    reset ? { p_generation: p.generation } : { p_generation: p.generation, p_changes: p.changes },
  );
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '40001' ? 409 : 422;
    return json(
      {
        ok: false,
        error:
          status === 403
            ? 'Your current role cannot change these records.'
            : status === 409
              ? 'This business changed on another device. Your local records are preserved; export them before resolving the conflict.'
              : 'The cloud refused these records. Your local records are preserved.',
      },
      status,
    );
  }
  return json({ ok: true, snapshot: data });
}
export async function POST(request: Request) {
  return mutate(request, false);
}
export async function DELETE(request: Request) {
  return mutate(request, true);
}
