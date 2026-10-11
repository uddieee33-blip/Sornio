/**
 * Small, pure helpers for the redeem route — kept apart so the route file
 * reads as the sequence of decisions it actually makes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** The `team_invites` row as the redeem route consumes it. */
export type TeamInviteRow = {
  id: string;
  business_id: string;
  role: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  revoked_at: string | null;
};

/** Narrows an arbitrary query result into a live invite, or nothing. */
export function inviteLooksLive(row: unknown): row is TeamInviteRow {
  if (!row || typeof row !== 'object') return false;
  const invite = row as Partial<TeamInviteRow>;
  if (typeof invite.id !== 'string' || typeof invite.business_id !== 'string' || typeof invite.role !== 'string') return false;
  if (typeof invite.expires_at !== 'string') return false;
  if (invite.used_at || invite.revoked_at) return false;
  const expiry = Date.parse(invite.expires_at);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;
  return true;
}

/** The teammate's arrival in the owner's audit trail. Best-effort by design. */
export async function auditLogsInsertNote(
  admin: SupabaseClient,
  entry: { tenantId: string; actorUserId: string; action: string; entityId?: string | null; details?: Record<string, unknown> },
): Promise<void> {
  try {
    await admin.from('audit_logs').insert({
      business_id: entry.tenantId,
      actor_user_id: entry.actorUserId,
      entity_type: 'team',
      entity_id: entry.entityId ?? null,
      action: entry.action,
      details: entry.details ?? null,
    });
  } catch {
    // The join succeeded; a missing audit line must never say otherwise.
  }
}
