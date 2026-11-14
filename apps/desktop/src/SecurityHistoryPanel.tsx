import {useRef, useState} from 'react';
import {invoke, type LocalSession} from './native';
import {errorMessage} from './access';
import type {KitchenStaffView} from '../../../packages/business-domain/src/kitchen-staff';
import {emptySecurityHistory, securityActions, securityActionLabel, securityOutcomeLabel, securityHistoryReport, type SecurityHistoryQuery, type SecurityHistoryReport} from '../../../packages/business-domain/src/security-history';
export function SecurityHistoryPanel({staff}: {staff: KitchenStaffView}) {
  const [filters, setFilters] = useState({...emptySecurityHistory});
  const [report, setReport] = useState<SecurityHistoryReport | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('Read recorded session and device security actions.');
  const running = useRef(false);
  // `applied` used to be a ref read directly in the render below. A ref read
  // during render is not a subscription: React may render, discard the result
  // and render again, and the fieldset's disabled state would then be computed
  // from a value the committed tree never saw. The applied query drives visible
  // UI, so it is state.
  const [applied, setApplied] = useState<SecurityHistoryQuery | null>(null);
  async function load(older: boolean) {
    if (running.current || !staff.canManageStaff) return;
    running.current = true; setBusy(true);
    const query = older && applied ? {...applied, cursor: report?.nextCursor ?? null} : {...filters, cursor: null};
    try {
      const identity = await invoke<LocalSession>('read_local_session');
      const value = await invoke('kitchen_action', {a: {kind: 'security_history', query}});
      // Native IPC scopes the report to the authenticated shop; validate that identity too.
      const businessId = identity.scope.businessId;
      setReport(securityHistoryReport(value, businessId, query)); setApplied(query);
      setMessage('Native history received. Each page replaces the previous page.');
    } catch (e) { setMessage(errorMessage(e, 'History unavailable; previous confirmed page retained.')); }
    finally { running.current = false; setBusy(false); }
  }
  if (!staff.canManageStaff) return null;
  const unchanged = applied !== null && ['action','actorId','search','startDate','endDate'].every(k => filters[k as keyof SecurityHistoryQuery] === applied[k as keyof SecurityHistoryQuery]);
  return <details><summary>Session & device security history</summary><p role="status">{message}</p><fieldset disabled={busy}>
    <label>Action<select value={filters.action} onChange={e => setFilters({...filters, action: e.target.value as SecurityHistoryQuery['action']})}><option value="">All security actions</option>{securityActions.map(a => <option key={a} value={a}>{securityActionLabel[a]}</option>)}</select></label>
    <label>Performed by<select value={filters.actorId} onChange={e => setFilters({...filters, actorId: e.target.value})}><option value="">All recorded actors</option>{staff.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
    <label>Find employee, device or request<input maxLength={120} value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})}/></label>
    <label>From date (UTC)<input type="date" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})}/></label>
    <label>Through date (UTC)<input type="date" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})}/></label>
    <button onClick={() => void load(false)}>Read security history</button><button disabled={!unchanged || !report?.nextCursor} onClick={() => void load(true)}>Older security actions</button>
  </fieldset>{report ? <><p>Confirmed at {report.generatedAt}. Names reflect the current directory. Historical device-to-employee ownership is not inferred.</p>{!report.events.length ? <p>No recorded actions match.</p> : null}<ol>{report.events.map(e => <li key={e.sequence}><strong>{securityActionLabel[e.action]}</strong> · {e.createdAt}<p>{e.actorName ?? e.actorId ?? 'Actor not recorded'}{e.actorRole ? ` (${e.actorRole} at the time)` : ''} → {e.targetName ?? e.targetId} · {e.targetKind} {e.targetId}</p>{e.action === 'staff.session_signout' ? <p>{securityOutcomeLabel(e.outcome)} · request {e.operationId}</p> : null}</li>)}</ol></> : null}<p>Read-only recorded history. Missing older events are not reconstructed; device approval and session termination are distinct actions.</p></details>;
}
