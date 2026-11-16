import {useRef, useState} from 'react';
import {TextInput, View} from 'react-native';
import {ActionButton, Body, Muted} from '../components/primitives';
import {useTheme} from '../theme/ThemeProvider';
import {hubWire} from '../lan/transport';
import type {HubPair, HubSession} from '../../../../packages/business-domain/src/restaurant-lan';
import type {KitchenStaffView} from '../../../../packages/business-domain/src/kitchen-staff';
import {emptySecurityHistory, securityActions, securityActionLabel, securityOutcomeLabel, securityHistoryReport, type SecurityHistoryQuery, type SecurityHistoryReport} from '../../../../packages/business-domain/src/security-history';
export function MobileSecurityHistory({pair, session, staff}: {pair: HubPair; session: HubSession; staff: KitchenStaffView}) {
  const {palette} = useTheme();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({...emptySecurityHistory});
  const [report, setReport] = useState<SecurityHistoryReport | null>(null);
  const [message, setMessage] = useState('Read session sign-out results and device approval changes from the shop.');
  const applied = useRef<SecurityHistoryQuery | null>(null), running = useRef(false);
  const supported = pair.hub.capabilities?.includes('staff.security-history.v1') ?? false;
  async function load(older: boolean) {
    if (running.current) return;
    running.current = true; setBusy(true);
    const query = older && applied.current ? {...applied.current, cursor: report?.nextCursor ?? null} : {...filters, cursor: null};
    try {
      if (!staff.canManageStaff || !supported || Date.now() >= session.expires * 1000) throw new Error('Administrative session unavailable. Reconnect and sign in again.');
      const value = await hubWire(pair.origin, pair.certificateSha256)('/v1/security-history', {version: 1, hubId: pair.hub.hubId, businessId: pair.hub.businessId, query}, session.token);
      setReport(securityHistoryReport(value, pair.hub.businessId, query)); applied.current = query;
      setMessage('Shop-confirmed history. Each page replaces the previous page.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Connection interrupted. Previous confirmed page retained; reconnect to refresh.'); }
    finally { running.current = false; setBusy(false); }
  }
  if (!staff.canManageStaff) return null;
  const unchanged = applied.current && ['action','actorId','search','startDate','endDate'].every(k => filters[k as keyof SecurityHistoryQuery] === applied.current![k as keyof SecurityHistoryQuery]);
  const field = {minHeight: 48, padding: 12, color: palette.ink, borderColor: palette.line, borderWidth: 1, borderRadius: 12};
  return <View style={{gap: 8}}><ActionButton label={open ? 'Close security history' : 'Session & device security history'} onPress={() => setOpen(!open)}/>{open ? <>
    <Muted>{message}</Muted>{!supported ? <Muted>Reconnect to an updated verified hub for security history.</Muted> : null}
    <Body>Action</Body><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{(['', ...securityActions] as const).map(a => <ActionButton key={a} disabled={busy} label={`${filters.action === a ? 'Selected · ' : ''}${a ? securityActionLabel[a] : 'All actions'}`} onPress={() => setFilters({...filters, action: a})}/>)}</View>
    <Body>Performed by</Body><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}><ActionButton disabled={busy} label={`${!filters.actorId ? 'Selected · ' : ''}All actors`} onPress={() => setFilters({...filters, actorId: ''})}/>{staff.employees.map(e => <ActionButton key={e.id} disabled={busy} label={`${filters.actorId === e.id ? 'Selected · ' : ''}${e.name}`} onPress={() => setFilters({...filters, actorId: e.id})}/>)}</View>
    <TextInput accessibilityLabel="Search security history" placeholder="Employee, device or request" editable={!busy} maxLength={120} value={filters.search} onChangeText={search => setFilters({...filters, search})} style={field}/>
    <TextInput accessibilityLabel="Security history from date UTC" placeholder="From YYYY-MM-DD (UTC)" editable={!busy} maxLength={10} value={filters.startDate} onChangeText={startDate => setFilters({...filters, startDate})} style={field}/>
    <TextInput accessibilityLabel="Security history through date UTC" placeholder="Through YYYY-MM-DD (UTC)" editable={!busy} maxLength={10} value={filters.endDate} onChangeText={endDate => setFilters({...filters, endDate})} style={field}/>
    <ActionButton label="Read authoritative security history" disabled={busy || !supported} onPress={() => void load(false)}/><ActionButton label="Older security actions" disabled={busy || !supported || !unchanged || !report?.nextCursor} onPress={() => void load(true)}/>
    {report ? <><Muted>{`Confirmed at ${report.generatedAt}. Current directory names; historical device ownership is not inferred.`}</Muted>{!report.events.length ? <Muted>No recorded actions match.</Muted> : null}{report.events.map(e => <View key={e.sequence} style={{padding: 12, borderColor: palette.line, borderWidth: 1, borderRadius: 12, gap: 4}}><Body>{securityActionLabel[e.action]}</Body><Muted>{`${e.createdAt} · ${e.actorName ?? e.actorId ?? 'Actor not recorded'}${e.actorRole ? ` (${e.actorRole} at the time)` : ''}`}</Muted><Body>{`${e.targetName ?? e.targetId} · ${e.targetKind} ${e.targetId}`}</Body>{e.action === 'staff.session_signout' ? <Muted>{`${securityOutcomeLabel(e.outcome)} · request ${e.operationId}`}</Muted> : null}</View>)}</> : null}
    <Muted>Read-only recorded history. Older missing events are not reconstructed. Revoking device approval differs from ending a session.</Muted>
  </> : null}</View>;
}
