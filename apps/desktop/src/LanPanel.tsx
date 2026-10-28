import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { errorCode, errorMessage } from './access';
import { money } from './billing-types';
type Status = {name: string | null; mode: 'standalone' | 'hub' | 'pairing' | 'client';businessId: string | null;hubId: string | null;deviceId: string | null;endpoint: string | null;enabled: boolean;rootFingerprint: string | null;pairingFingerprint: string | null;pending: number};
type LiveStatus = {status: Status; listening: boolean; address: string | null; error: string | null};
type Approval = {businessName: string; businessId: string; hubId: string; deviceId: string; rootFingerprint: string};
type Device = {deviceId: string; name: string; role: 'owner' | 'manager' | 'cashier';enabled: boolean;revision: number};
export function LanPanel({disabled,onLocked,onBusyChange,onDirtyChange,onModeChange}:{disabled:boolean;onLocked:()=>void;onBusyChange:(busy:boolean)=>void;onDirtyChange:(dirty:boolean)=>void;onModeChange:(mode:string)=>void}) {
  const [live,setLive] = useState<LiveStatus | null>(null);
  const [open,setOpen] = useState(false);
  const [busy,setBusy] = useState(false);
  const [password,setPassword] = useState('');
  const [endpoint,setEndpoint] = useState('');
  const [name,setName] = useState('');
  const [role,setRole] = useState<Device['role']>('cashier');
  const [approval,setApproval] = useState<Approval | null>(null);
  const [pairPreview,setPairPreview] = useState<{name:string;deviceId:string;requestFingerprint:string} | null>(null);
  const [requestFingerprint,setRequestFingerprint] = useState('');
  const [fingerprint,setFingerprint] = useState('');
  const [devices,setDevices] = useState<Device[]>([]);
  const [sales,setSales] = useState<{sequence:number;invoice:{id:string;totalPaise:number}}[]>([]);
  const [message,setMessage] = useState('');
  const [failed,setFailed] = useState(false);
  const submitting=useRef(false);
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false);},[busy,onBusyChange]);
  useEffect(()=>{onDirtyChange(Boolean(password || fingerprint || requestFingerprint));return()=>onDirtyChange(false);},[password,fingerprint,requestFingerprint,onDirtyChange]);
  const applyStatus=useCallback((state:LiveStatus)=>{
    setLive(state);setEndpoint(state.status.endpoint ?? '');setName(state.status.name ?? '');onModeChange(state.status.mode);
  },[onModeChange]);
  const refresh=useCallback(async()=>{
    const state=await invoke<LiveStatus>('read_shop_lan');
    if (!mounted.current) return;
    applyStatus(state);
    if(state.status.mode === 'hub') {
      const rows=await invoke<Device[]>('list_shop_computers');
      if(mounted.current)setDevices(rows);
    }
  },[applyStatus]);
  useEffect(()=>{
    let current=true;
    invoke<LiveStatus>('read_shop_lan').then(state=>{
      if(!current)return;
      applyStatus(state);
      if(state.status.mode === 'hub') void invoke<Device[]>('list_shop_computers').then(rows=>{if(current)setDevices(rows);}).catch(()=>{});
    }).catch(()=>{/* Standalone older review transports do not advertise LAN. */});
    return()=>{current=false;};
  },[applyStatus]);
  async function run(command:string,args:Record<string,unknown>={}) {
    if (submitting.current || disabled) return;
    submitting.current=true;setBusy(true);setMessage('');setFailed(false);
    try {
      if(command==='refresh') await refresh();
      else if(command==='preview_shop_pair_request') {setPairPreview(null);setPairPreview(await invoke(command));}
      else if(command==='preview_shop_approval') {setApproval(null);setApproval(await invoke<Approval | null>(command));}
      else if(command==='list_local_invoices') {setSales(await invoke(command,{after:0}));}
      else {
        const result=await invoke(command,{password,endpoint,name,role,fingerprint,requestFingerprint,...args});
        if(!mounted.current)return;
        setMessage(result===false?'File selection cancelled. Existing native configuration is retained.':command==='join_shop_hub'?'Hub trust saved. Refresh checkout to contact the shop hub.':command==='export_shop_pair_request'?'Pairing request saved. Take this public file to the hub administrator.':command==='approve_shop_computer'?'Computer approved. Deliver the public approval file to that computer and compare the hub fingerprint.':'Shop network settings saved.');
        if(command==='join_shop_hub')setApproval(null);
        if(command==='approve_shop_computer')setPairPreview(null);
        await refresh();
      }
    } catch(error) {
      if(!mounted.current)return;
      setFailed(true);setMessage(errorMessage(error,'The shop network operation stopped. Keep the existing operation IDs and retry.'));
      if(['locked','incorrect_password','rate_limited'].includes(errorCode(error) ?? ''))onLocked();
      try{await refresh();}catch{/* Preserve failure and existing scope. */}
    } finally {setPassword('');setFingerprint('');setRequestFingerprint('');submitting.current=false;if(mounted.current)setBusy(false);}
  }
  const mode=live?.status.mode ?? 'standalone';
  return <section className="panel" aria-labelledby="lan-heading">
    <h2 id="lan-heading">Shop network</h2>
    <p>One trusted shop hub orders shared-stock sales. Computers keep separate encrypted databases. Internet is not required.</p>
    <p role="status">Mode: {mode}. {live?.listening ? `Listening on ${live.address}.` : mode==='hub' ? 'Hub listener is stopped or unavailable.' : null} {mode==='client'?'This computer confirms sales through its approved hub.':null}</p>
    {live?.error ? <p role="alert">{live.error}</p> : null}
    {live?.status.rootFingerprint ? <><label htmlFor="lan-root">Hub trust fingerprint</label><input id="lan-root" readOnly value={live.status.rootFingerprint}/></> : null}
    {live?.status.pairingFingerprint ? <><label htmlFor="lan-csr-hash">This computer’s pairing fingerprint</label><input id="lan-csr-hash" readOnly value={live.status.pairingFingerprint}/></> : null}
    {live?.status.businessId ? <p>Shop ID: {live.status.businessId}</p> : null}
    <p>If the hub is unavailable, keep drafts and retry the same pending sale. Cached stock does not reserve stock. Never take a second payment for an uncertain result.</p>
    <button type="button" className="quiet-button" disabled={busy || disabled} onClick={()=>{setPassword('');setFingerprint('');setOpen(v=>!v);}}>{open?'Close shop network controls':'Open shop network controls'}</button>
    {open ? <fieldset disabled={busy || disabled}>
      <label htmlFor="lan-password">Local password for network settings</label><input id="lan-password" type="password" autoComplete="current-password" maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/>
      <label htmlFor="lan-address">Shop hub address</label><input id="lan-address" placeholder="192.168.1.10:45433" maxLength={100} value={endpoint} onChange={e=>setEndpoint(e.target.value)}/>
      <p>Use the hub’s private LAN IP and a fixed port. 127.0.0.1 connects only on this PC. Allow this app on the Windows private-network firewall when appropriate.</p>
      {mode==='standalone' ? <button type="button" disabled={!password || !endpoint} onClick={()=>void run('designate_shop_hub')}>Make this PC the shop hub</button> : null}
      {mode==='hub' ? <>
        <button type="button" disabled={!password} onClick={()=>void run('set_shop_hub_enabled',{enabled:!live?.listening})}>{live?.listening?'Stop hub listener':'Start or retry hub listener'}</button>
        <label htmlFor="lan-role">Computer role to approve</label><select id="lan-role" value={role} onChange={e=>setRole(e.target.value as Device['role'])}><option value="cashier">Cashier</option><option value="manager">Manager</option><option value="owner">Owner</option></select>
        <button type="button" className="quiet-button" onClick={()=>void run('preview_shop_pair_request')}>Import computer request…</button>
        {pairPreview ? <div role="group" aria-label="Computer request preview"><h3>{pairPreview.name}</h3><p>Compare this request with the intended computer before granting its role.</p><label htmlFor="lan-request-hash">Imported request fingerprint</label><input id="lan-request-hash" readOnly value={pairPreview.requestFingerprint}/><label htmlFor="lan-confirm-request">Enter the pairing fingerprint shown on that computer</label><input id="lan-confirm-request" autoComplete="off" maxLength={64} value={requestFingerprint} onChange={e=>setRequestFingerprint(e.target.value)}/><button type="button" disabled={!password || requestFingerprint!==pairPreview.requestFingerprint} onClick={()=>void run('approve_shop_computer')}>Approve computer request…</button></div> : null}
        <ul>{devices.map(device=><li key={device.deviceId}><strong>{device.name}</strong><p>{device.role} · {device.enabled?'Enabled':'Disabled'}</p><button className="quiet-button" type="button" disabled={!password} onClick={()=>void run('change_shop_computer',{deviceId:device.deviceId,role:device.role,enabled:!device.enabled,revision:device.revision})}>{device.enabled?'Disable':'Enable'} {device.name}</button><button className="quiet-button" type="button" disabled={!password} onClick={()=>void run('change_shop_computer',{deviceId:device.deviceId,role,enabled:device.enabled,revision:device.revision})}>Assign selected role to {device.name}</button></li>)}</ul>
      </> : null}
      {mode==='standalone' || mode==='pairing' ? <>
        <label htmlFor="lan-computer">This computer’s name</label><input id="lan-computer" maxLength={120} value={name} onChange={e=>setName(e.target.value)}/>
        <p>Join only from a computer without local stock, invoices or a pending checkout. Create a request here, have the hub approve it, then import its approval here. Pairing files contain public certificates; private keys stay on their original PCs.</p>
        <button type="button" disabled={!password || !name.trim()} onClick={()=>void run('export_shop_pair_request')}>Export computer pairing request…</button>
      </> : null}
      {mode==='pairing' ? <>
        <button type="button" className="quiet-button" onClick={()=>void run('preview_shop_approval')}>Import hub approval…</button>
        {approval ? <div role="group" aria-label="Shop hub approval"><h3>{approval.businessName}</h3><p>Hub ID: {approval.hubId}</p><label htmlFor="lan-imported-root">Approval fingerprint</label><input id="lan-imported-root" readOnly value={approval.rootFingerprint}/><label htmlFor="lan-confirm-root">Enter the fingerprint shown on the hub PC</label><input id="lan-confirm-root" autoComplete="off" maxLength={64} value={fingerprint} onChange={e=>setFingerprint(e.target.value)}/><button type="button" disabled={!password || !endpoint || fingerprint!==approval.rootFingerprint} onClick={()=>void run('join_shop_hub')}>Trust and join this shop hub</button></div> : null}
      </> : null}
      {mode==='client' ? <><button type="button" disabled={!password || !endpoint} onClick={()=>void run('change_shop_hub_address')}>Update hub address</button><p>Displayed checkout balances are this computer’s confirmed receipts. Stock corrections and device approvals are made on the hub in this milestone.</p></> : null}
      {mode==='hub' || mode==='client' ? <button type="button" className="quiet-button" onClick={()=>void run('list_local_invoices')}>Read shop sales (owner/manager)</button> : null}
      <button type="button" className="quiet-button" onClick={()=>void run('refresh')}>Refresh shop network status</button>
      {sales.length ? <ul aria-label="Shop sales">{sales.map(record=><li key={record.sequence}>{record.invoice.id} · {money(record.invoice.totalPaise)}</li>)}</ul> : null}
    </fieldset> : null}
    {message ? <p role={failed?'alert':'status'} aria-live="polite">{message}</p> : null}
    {busy ? <p role="status">Working with the shop network…</p> : null}
  </section>;
}
