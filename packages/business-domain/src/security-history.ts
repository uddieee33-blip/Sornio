export const securityActions = ['staff.session_signout', 'hub.device_approved', 'hub.device_revoked'] as const;
export type SecurityAction = typeof securityActions[number];
export const securityActionLabel: Record<SecurityAction, string> = {
  'staff.session_signout': 'Session sign-out result',
  'hub.device_approved': 'Device approved',
  'hub.device_revoked': 'Device approval revoked',
};
export type SecurityHistoryQuery = {action: '' | SecurityAction; actorId: string; search: string; startDate: string; endDate: string; cursor: number | null; limit: number};
export const emptySecurityHistory: SecurityHistoryQuery = {action: '', actorId: '', search: '', startDate: '', endDate: '', cursor: null, limit: 25};
export type SecurityEvent = {sequence: number; actorId: string | null; actorName: string | null; actorRole: string | null; action: SecurityAction; targetId: string; targetKind: 'employee' | 'device' | 'operation'; targetName: string | null; operationId: string | null; outcome: 'signed_out' | 'already_inactive' | 'refused' | null; createdAt: string};
export type SecurityHistoryReport = {businessId: string; generatedAt: string; events: SecurityEvent[]; nextCursor: number | null};
export const securityOutcomeLabel = (v: SecurityEvent['outcome']) => v === 'signed_out' ? 'Session ended' : v === 'already_inactive' ? 'Session was already inactive' : v === 'refused' ? 'Request refused; session not ended' : 'Outcome not recorded';
export function securityHistoryReport(value: unknown, businessId: string, query: SecurityHistoryQuery): SecurityHistoryReport {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k)) && allowed.every(k => Object.hasOwn(v, k));
  const text = (v: unknown, max = 128): v is string => typeof v === 'string' && v.length <= max;
  const nullableText = (v: unknown, max = 128) => v === null || text(v, max);
  const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
  const date = (v: unknown) => text(v, 40) && Number.isFinite(Date.parse(v));
  if (!object(value) || !keys(value, ['businessId','generatedAt','events','nextCursor']) || value.businessId !== businessId || !date(value.generatedAt) || !Array.isArray(value.events) || value.events.length > query.limit || !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 50 || query.cursor !== null && !positive(query.cursor)) throw new Error('Unrecognised security history page.');
  let previous = query.cursor ?? Number.MAX_SAFE_INTEGER;
  for (const e of value.events) {
    if (!object(e) || !keys(e, ['sequence','actorId','actorName','actorRole','action','targetId','targetKind','targetName','operationId','outcome','createdAt']) || !positive(e.sequence) || e.sequence >= previous || !nullableText(e.actorId) || !nullableText(e.actorName, 120) || !nullableText(e.actorRole, 40) || !securityActions.includes(e.action as SecurityAction) || !text(e.targetId) || !['employee','device','operation'].includes(String(e.targetKind)) || !nullableText(e.targetName, 120) || !nullableText(e.operationId) || !(e.outcome === null || ['signed_out','already_inactive','refused'].includes(String(e.outcome))) || !date(e.createdAt)) throw new Error('Invalid security audit event.');
    if (query.action && e.action !== query.action || query.actorId && e.actorId !== query.actorId || query.startDate && String(e.createdAt).slice(0,10) < query.startDate || query.endDate && String(e.createdAt).slice(0,10) > query.endDate) throw new Error('Security report does not match the requested filters.');
    if (e.action === 'staff.session_signout' ? e.targetKind === 'device' || !e.operationId : e.targetKind !== 'device' || e.operationId !== null || e.outcome !== null) throw new Error('Inconsistent security event.');
    previous = e.sequence;
  }
  if (value.nextCursor !== null && (!positive(value.nextCursor) || value.events.length !== query.limit || value.nextCursor !== previous)) throw new Error('Invalid security history cursor.');
  return value as SecurityHistoryReport;
}
