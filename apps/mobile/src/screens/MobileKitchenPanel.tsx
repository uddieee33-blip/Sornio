import {useEffect,useRef,useState} from 'react';
import {AppState,View} from 'react-native';
import * as Crypto from 'expo-crypto';
import {ActionButton,Body,Eyebrow,Muted} from '../components/primitives';
import {useTheme} from '../theme/ThemeProvider';
import {createSecureStore} from '../storage/secureStore';
import {hubWire} from '../lan/transport';
import {HubConnectionError} from '../../../../packages/business-domain/src/hub-setup';
import {liveRefresh} from '../../../../packages/business-domain/src/live-refresh';
import {KITCHEN_CAPABILITY,kitchenOutbox,nextKitchenState,type KitchenPending} from '../../../../packages/business-domain/src/restaurant-kitchen';
import type {HubPair,HubSession} from '../../../../packages/business-domain/src/restaurant-lan';
import type {RestaurantSnapshot,PaidKitchenTicket} from '../../../../packages/business-domain/src/restaurant-operations';

const reasons:Record<string,string>={revision_conflict:'Another employee updated this ticket. Refresh and review the confirmed state before choosing a new action.',assigned_to_other_staff:'This order is assigned to another employee. Ask the desktop owner to transfer it.',transition_refused:'This transition is no longer valid. Refresh the ticket before continuing.',order_closed:'The order is closed. No kitchen change was made.'};
const labels={preparing:'Start preparing',ready:'Mark ready',served:'Mark served'};

/** Only hub-confirmed state is rendered as preparation progress. The separate
 * encrypted outbox retains one immutable kitchen command across restarts. */
export function MobileKitchenPanel({pair,staff,snapshot,onRefresh}:{pair:HubPair;staff:HubSession;snapshot:RestaurantSnapshot;onRefresh:()=>Promise<void>}){
 const {palette}=useTheme();
 const [pending,setPending]=useState<KitchenPending|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('Reading saved kitchen actions…');
 const running=useRef(false),mounted=useRef(false),latest=useRef({pending,onRefresh});latest.current={pending,onRefresh};
 const supported=pair.hub.capabilities?.includes(KITCHEN_CAPABILITY)??false;
 const outbox=()=>kitchenOutbox(createSecureStore(true),pair,staff.actorId);
 async function resultMessage(p:KitchenPending){
  if(!mounted.current)return;
  setPending(p);
  setMessage(p.result?.status==='accepted'?`Hub confirmed ${p.result.state} at ticket revision ${p.result.revision}.`:p.result?.status==='refused'?reasons[p.result.reason]??'The hub refused this action. Ask the desktop owner to review it.':'Saved locally. The hub has not confirmed a kitchen change.');
  if(p.result){try{await latest.current.onRefresh();}catch{if(mounted.current)setMessage('Final result saved. Refresh the workspace to see the latest shared ticket state.');}}
 }
 async function recover(){
  if(Date.now()>=staff.expires*1000)throw new Error('Staff session expired. Sign in to recover the same saved action.');
  const store=outbox();try{await resultMessage(await store.recover(hubWire(pair.origin,pair.certificateSha256),staff.token,{resumeAfterReconnect:true}));}
  finally{const saved=await store.load();if(mounted.current)setPending(saved);}
 }
 async function run(action:()=>Promise<void>){
  if(running.current)return;running.current=true;setBusy(true);
  try{await action();}catch(error){if(mounted.current)setMessage(error instanceof Error?error.message:'Connection interrupted. Recover the same saved action.');}
  finally{running.current=false;if(mounted.current)setBusy(false);}
 }
 useEffect(()=>{
  mounted.current=true;let active=true;
  void outbox().load().then(saved=>{if(active){setPending(saved);setReady(true);setMessage(saved?'A saved kitchen action needs review or recovery.':'Choose the next preparation step. Changes require hub confirmation.');}}).catch(()=>{if(active)setMessage('Saved kitchen actions could not be read. Keep device data and retry after reopening; new actions are blocked.');});
  return()=>{active=false;mounted.current=false;};
 },[]);
 useEffect(()=>{
  if(!supported||!ready)return;
  const refresh=liveRefresh({intervalMs:5000,eligible:()=>!running.current&&AppState.currentState==='active',poll:async current=>{
   const p=latest.current.pending;if(p?.state!=='unknown'||!p.resumeAfterReconnect)return;
   if(Date.now()>=staff.expires*1000){refresh.stop();setMessage('Staff session expired. Sign in to recover the saved kitchen action.');return;}
   running.current=true;setBusy(true);try{const saved=await outbox().recover(hubWire(pair.origin,pair.certificateSha256),staff.token);if(current())await resultMessage(saved);}
   finally{running.current=false;if(mounted.current)setBusy(false);}
  },onError:error=>{setMessage(error instanceof Error?error.message:'Kitchen connection interrupted. The saved action remains unconfirmed.');if(error instanceof HubConnectionError&&['session_required','access_refused','wrong_shop','certificate_changed','certificate_untrusted','certificate_expired','unsupported_version','native_connection_unavailable'].includes(error.code))refresh.stop();}});
  refresh.start();const sub=AppState.addEventListener('change',state=>{if(state==='active')refresh.start();else refresh.stop();});return()=>{refresh.stop();sub.remove();};
 },[supported,ready]);
 const final=pending?.state==='accepted'||pending?.state==='refused';
 return <View style={{gap:12}}><Eyebrow>Live kitchen</Eyebrow><View accessibilityLiveRegion="polite"><Body>{message}</Body></View><Muted>These tickets are confirmed by the shop. Pending actions below are saved only on this device until accepted. No payment, stock deduction or table release occurs.</Muted>
 {!supported?<Body>Update the desktop hub, then reconnect and verify its certificate to enable kitchen controls. Existing ticket visibility remains available.</Body>:null}
 {pending?<View style={{gap:8,padding:12,borderWidth:1,borderColor:palette.line,borderRadius:12}}><Body>{`Saved action · ${pending.state} · ${pending.request.state}`}</Body><Muted>{`Ticket ${pending.request.ticketId} · expected revision ${pending.request.expectedRevision}`}</Muted>{pending.result?.status==='refused'?<Muted>{`Hub now reports ${pending.result.state??'ticket unavailable'} · revision ${pending.result.revision??'unknown'}`}</Muted>:null}{!final?<><Muted>{pending.resumeAfterReconnect?'The same action will recover when the verified connection returns in foreground.':'No confirmed outcome yet. Keep this action and recover it before another kitchen command.'}</Muted><ActionButton label="Recover saved kitchen action" disabled={busy||!ready||!supported} onPress={()=>void run(recover)}/>{pending.resumeAfterReconnect?<ActionButton label="Pause kitchen reconnection retries" disabled={busy} onPress={()=>void run(async()=>{await outbox().pauseReconnect();setPending(await outbox().load());setMessage('Automatic retries paused. The saved action still needs recovery.');})}/>:null}</>:<ActionButton label="Refresh tickets & acknowledge final result" disabled={busy} onPress={()=>void run(async()=>{await latest.current.onRefresh();await outbox().acknowledge();setPending(null);setMessage('Latest tickets refreshed. Review their confirmed state before choosing another action.');})}/>}</View>:null}
 {!snapshot.tickets.length&&!snapshot.paidKitchen?.length?<Muted>No active kitchen tickets. Accepted order items need explicit desktop kitchen dispatch.</Muted>:null}
 {[...snapshot.tickets,...(snapshot.paidKitchen??[])].map(ticket=>{const paid='tableName' in ticket?ticket as PaidKitchenTicket:null;const order=snapshot.orders.find(o=>o.id===ticket.orderId),table=snapshot.tables.find(t=>t.id===order?.tableId),assignment=snapshot.assignments.find(a=>a.orderId===ticket.orderId),next=nextKitchenState(ticket.state);return <View key={ticket.id} style={{gap:8,padding:16,borderWidth:1,borderColor:palette.line,borderRadius:12}}><Body>{`${paid?.tableName??table?.name??'Takeaway'} · ${paid?'Paid · ':''}${ticket.state} · revision ${ticket.revision}`}</Body><Muted>{`KOT ${ticket.id} · ${paid?.displayName??assignment?.displayName??'Unassigned'}`}</Muted>{ticket.items.map((item,index)=><Body key={index}>{`${item.quantity} × ${item.name}${item.note?' · '+item.note:''}`}</Body>)}{next?<ActionButton label={`${labels[next]} · ${paid?.tableName??table?.name??'takeaway'} · ${ticket.id.slice(0,8)}`} disabled={!supported||!ready||busy||!!pending} onPress={()=>void run(async()=>{const saved=await outbox().queue({version:1,hubId:pair.hub.hubId,businessId:pair.hub.businessId,actorId:staff.actorId,operationId:Crypto.randomUUID(),ticketId:ticket.id,expectedRevision:ticket.revision,state:next});if(mounted.current){setPending(saved);setMessage('Kitchen action saved locally; checking authoritative hub…');}await recover();})}/>:null}</View>;})}
 </View>;
}
