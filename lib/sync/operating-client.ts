'use client';
import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/security/csrf';
import type { StoreState } from '@/lib/store';
import { changesFor, type OperatingSnapshot } from './records';
export type OperatingResult = { ok: true; snapshot: OperatingSnapshot } | { ok: false; error: string; status?: number };
async function request(method: 'GET' | 'POST' | 'DELETE', body?: unknown): Promise<OperatingResult> {
  const send = () =>
    fetch('/api/sync', {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        [CSRF_HEADER]: decodeURIComponent(
          document.cookie
            .split('; ')
            .find((s) => s.startsWith(`${CSRF_COOKIE}=`))
            ?.split('=')
            .slice(1)
            .join('=') ?? '',
        ),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  let response = await send();
  if (response.status === 403) {
    await fetch('/api/auth/session', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    response = await send();
  }
  const payload = await response.json();
  return response.ok && payload.ok
    ? { ok: true, snapshot: payload.snapshot }
    : {
        ok: false,
        status: response.status,
        error: payload.error ?? 'Business sync failed. Your local records are preserved.',
      };
}
export async function readOperatingRecords(): Promise<OperatingResult> {
  try {
    return await request('GET');
  } catch {
    return {
      ok: false,
      error: 'Could not reach the server. Your local records are preserved.',
    };
  }
}
export async function saveOperatingRecords(state: StoreState, role?: string): Promise<OperatingResult> {
  if (state.demoMode)
    return {
      ok: false,
      error: 'Demo records cannot be uploaded to a real business.',
    };
  if (!state.cloud?.ready)
    return {
      ok: false,
      error: 'Restore the cloud records before uploading this device.',
    };
  try {
    const changes =
      role === 'auditor'
        ? []
        : changesFor(state).filter(
            (row) =>
              role !== 'cashier' ||
              !['products', 'plans', 'reminderTemplates', 'campaigns', 'settings'].includes(row.kind),
          );
    return await request('POST', {
      generation: state.cloud.generation,
      changes,
    });
  } catch {
    return {
      ok: false,
      error: 'Could not reach the server. Your local records are preserved.',
    };
  }
}
export async function resetOperatingRecords(state: StoreState): Promise<OperatingResult> {
  if (state.demoMode || !state.cloud?.ready)
    return { ok: false, error: 'Only a connected real business can be reset.' };
  try {
    return await request('DELETE', { generation: state.cloud.generation });
  } catch {
    return {
      ok: false,
      error: 'Reset failed. Your local records are preserved.',
    };
  }
}
