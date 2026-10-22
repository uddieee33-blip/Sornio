'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { planById } from '@/lib/plans';
import { useNow } from '@/lib/perf/clock';
import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/security/csrf';

type History = { plan_id: string; months: number; payment_reference: string; expires_at: string; redeemed_at: string | null };
type Business = { id: string; name: string; status: string };
const field = 'mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm text-stone-900';

export function PlatformKeyConsole() {
  const now = useNow(60_000);
  const [businessId, setBusinessId] = useState('');
  const [business, setBusiness] = useState<Business | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [planId, setPlanId] = useState('growth');
  const [months, setMonths] = useState(1);
  const [reference, setReference] = useState('');
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [code, setCode] = useState('');
  const price = planById(planId === 'scale' ? 'scale' : 'growth').prices.find((period) => period.months === months);

  async function load() {
    setBusy(true); setNotice(''); setBusiness(null); setHistory([]);
    try {
      const response = await fetch(`/api/platform/keys?business=${encodeURIComponent(businessId.trim())}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load the business.');
      setBusiness(data.business); setHistory(data.keys);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load the business.'); }
    finally { setBusy(false); }
  }

  async function issue(event: React.FormEvent) {
    event.preventDefault();
    if (!business || code || busy) return;
    setBusy(true); setNotice('');
    try {
      const token = document.cookie.split('; ').find((part) => part.startsWith(`${CSRF_COOKIE}=`))?.slice(CSRF_COOKIE.length + 1);
      const response = await fetch('/api/platform/keys', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'content-type': 'application/json', ...(token ? { [CSRF_HEADER]: decodeURIComponent(token) } : {}) },
        body: JSON.stringify({ businessId: business.id, planId, months, reference, paymentVerified: verified }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Key issuance failed. Check history before retrying.');
      setCode(data.code); setVerified(false);
      setNotice('Key issued. Copy it now and deliver it privately to this business owner.');
      setHistory((current) => [{ plan_id: data.planId, months: data.months, payment_reference: data.reference, expires_at: data.expiresAt, redeemed_at: null }, ...current]);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Connection lost. Check history before retrying.'); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto min-h-screen max-w-3xl space-y-6 p-4 py-8 sm:p-8">
    <Link href="/subscription" className="text-sm font-semibold text-brand-700">← Your Plan</Link>
    <header><p className="text-xs font-semibold uppercase tracking-widest text-brand-700">Platform administration</p>
      <h1 className="mt-2 text-3xl font-bold text-stone-900">Provide an activation key</h1>
      <p className="mt-3 text-sm text-stone-600">Verify the payment in your bank, check the business, then issue a key. A key activates only that business. No message is sent automatically.</p></header>
    {notice && <p role="status" className="rounded-xl border border-stone-300 bg-white p-4 text-sm text-stone-800">{notice}</p>}
    {code && <Card className="space-y-3 border-emerald-400">
      <h2 className="font-bold text-stone-900">Copy this key before leaving</h2>
      <p className="text-sm text-stone-600">For {business?.name}. The raw key cannot be retrieved again. It expires after 30 days if unused.</p>
      <textarea aria-label="Issued activation key" readOnly value={code} className={`${field} font-mono`} rows={3} />
      <div className="flex flex-wrap gap-3"><Button onClick={async () => { try { await navigator.clipboard.writeText(code); setNotice('Key copied.'); } catch { setNotice('Select and copy the key from the box above.'); } }}>Copy key</Button>
      <Button variant="secondary" onClick={() => { setCode(''); setReference(''); setVerified(false); }}>I saved the key</Button></div>
    </Card>}
    <Card className="space-y-4">
      <h2 className="font-bold text-stone-900">1. Find the business</h2>
      <label className="block text-sm text-stone-700">Business ID from the owner’s Your Plan page
        <input className={field} value={businessId} disabled={busy || Boolean(code)} onChange={(e) => { setBusinessId(e.target.value); setBusiness(null); setHistory([]); setVerified(false); }} placeholder="Business UUID" autoComplete="off" /></label>
      <Button variant="secondary" disabled={busy || Boolean(code) || !businessId.trim()} onClick={() => void load()}>{busy ? 'Checking…' : 'Check business and history'}</Button>
      {business && <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-800"><strong>{business.name}</strong> · {business.status}<br /><span className="break-all font-mono text-xs">{business.id}</span></p>}
    </Card>
    <Card><form onSubmit={(e) => void issue(e)} className="space-y-4">
      <h2 className="font-bold text-stone-900">2. Verify payment and issue</h2>
      <fieldset disabled={busy || !business || Boolean(code)} className="space-y-4 disabled:opacity-60">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-stone-700">Plan<select className={field} value={planId} onChange={(e) => { setPlanId(e.target.value); if (e.target.value === 'scale' && months === 1) setMonths(3); setVerified(false); }}><option value="growth">Growth</option><option value="scale">Scale</option></select></label>
          <label className="text-sm text-stone-700">Period<select className={field} value={months} onChange={(e) => { setMonths(Number(e.target.value)); setVerified(false); }}>{planId === 'growth' && <option value={1}>1 month</option>}<option value={3}>3 months</option><option value={12}>12 months</option></select></label>
        </div>
        <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-800">Catalogue total: <strong>₹{price?.amount.toLocaleString('en-IN')}</strong> for {months} month(s). Check that the bank payment matches this order.</p>
        <label className="block text-sm text-stone-700">Verified bank / UPI transaction reference<input className={field} maxLength={80} minLength={2} required value={reference} onChange={(e) => { setReference(e.target.value); setVerified(false); }} autoComplete="off" /></label>
        <label className="flex items-start gap-3 text-sm text-stone-700"><input type="checkbox" className="mt-1 h-5 w-5" checked={verified} onChange={(e) => setVerified(e.target.checked)} required />I independently verified this payment, business, plan and period. A screenshot alone is not confirmation.</label>
        <Button type="submit" disabled={!verified || reference.trim().length < 2}>{busy ? 'Issuing…' : 'Issue one-time key'}</Button>
      </fieldset>
    </form></Card>
    {business && <Card><h2 className="font-bold text-stone-900">Recent keys for {business.name}</h2>
      <p className="mt-2 text-xs text-stone-600">Latest 25 keys. Raw keys are never stored here. If a response was lost, check the reference here before retrying.</p>
      {history.length ? <ul className="mt-4 divide-y divide-stone-200">{history.map((key) => <li key={key.payment_reference} className="py-3 text-sm text-stone-700"><strong>{key.plan_id} · {key.months} months</strong><span className="float-right">{key.redeemed_at ? 'Redeemed' : new Date(key.expires_at).getTime() <= now ? 'Expired' : 'Awaiting redemption'}</span><p className="break-all font-mono text-xs">{key.payment_reference}</p></li>)}</ul> : <p className="mt-3 text-sm text-stone-600">No keys issued yet.</p>}
    </Card>}
  </main>;
}
