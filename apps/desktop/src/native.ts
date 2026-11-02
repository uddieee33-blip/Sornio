import { invoke as tauriInvoke } from '@tauri-apps/api/core';
export type Role = 'owner' | 'manager' | 'assistant_manager' | 'cashier';
export type Scope = { businessId: string; workspaceId: string };
export type Principal = { id: string; username: string; displayName: string; role: Role; enabled: boolean; revision: number };
export type LocalSession = { scope: Scope; principal: Principal; businessName: string };
let scope: Scope | null = null;
export function setNativeSession(session: LocalSession | null) { scope = session?.scope ?? null; }
const recovery = new Set(['choose_local_backup', 'preview_local_backup', 'restore_local_backup']);
const unscoped = new Set(['workspace_access_status', 'setup_local_access', 'unlock_workspace', 'lock_workspace', 'read_local_session']);
/** Scope is a comparison value, never authority. Native Rust owns the session and role. */
export async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!unscoped.has(command) && !recovery.has(command) && !scope) throw { code: 'locked', message: 'Unlock this workspace to continue.' };
  try { return await tauriInvoke<T>(command, unscoped.has(command) ? args : { ...args, scope }); }
  catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && ['locked', 'workspace_mismatch'].includes(String(error.code))) {
      scope = null; window.dispatchEvent(new Event('sornio-session-locked'));
    }
    throw error;
  }
}
