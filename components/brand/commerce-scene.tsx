'use client';

import { useRef, useState } from 'react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BarChart3, Boxes, Check, ChevronDown, CircleHelp, CreditCard, Home, Package, Plus, Receipt, Search, Settings, Users } from 'lucide-react';
import { BrandIcon } from '@/components/ui/BrandLogo';

const views = [
  { id: 'overview', label: 'Your day', icon: Home },
  { id: 'billing', label: 'A new bill', icon: Receipt },
  { id: 'stock', label: 'Your stock', icon: Boxes },
] as const;
type View = typeof views[number]['id'];

/** A separate, clearly labelled product tour. It never reads or writes shop records. */
export function CommerceScene() {
  const [view, setView] = useState<View>('overview');
  const [saved, setSaved] = useState(false);
  const [quantity, setQuantity] = useState(2);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const money = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;
  const chooseView = (next: View) => { setView(next); setSaved(false); };

  return (
    <div className="commerce-tour">
      <div className="commerce-tour-topline"><span>MEET YOUR NEW WORKSPACE</span><span><i /> Interactive preview</span></div>
      <div className="commerce-preview">
        <aside className="commerce-sidebar" aria-hidden="true">
          <div className="commerce-logo"><BrandIcon size={28} /><strong>Sornio</strong></div>
          <div className="commerce-shop"><span>G</span><div><strong>Goodday Store</strong><small>Retail workspace</small></div><ChevronDown size={12} /></div>
          <span className="commerce-nav-caption">WORKSPACE</span>
          {[{ icon: Home, label: 'Overview', active: view === 'overview' }, { icon: Receipt, label: 'Billing', active: view === 'billing' }, { icon: Package, label: 'Products & stock', active: view === 'stock' }, { icon: Users, label: 'Customers' }, { icon: CreditCard, label: 'Payments' }, { icon: BarChart3, label: 'Reports' }].map(item => <div key={item.label} className={`commerce-nav-item ${item.active ? 'is-active' : ''}`}><item.icon size={16} />{item.label}</div>)}
          <div className="commerce-sidebar-bottom"><div><CircleHelp size={15} /> Help & support</div><div><Settings size={15} /> Settings</div><span className="commerce-owner"><span>AK</span><span><strong>Aman Kumar</strong><small>Store owner</small></span></span></div>
        </aside>
        <div className="commerce-screen">
          <div className="commerce-topbar"><span>Goodday Store <span>/</span> {view === 'overview' ? 'Overview' : view === 'billing' ? 'Billing' : 'Products & stock'}</span><span className="commerce-sample-badge">SAMPLE WORKSPACE</span></div>
          <div className="commerce-screen-content" id="commerce-tour-panel" role="tabpanel" aria-labelledby={`commerce-tab-${view}`} tabIndex={0}>
            {view === 'overview' ? <>
              <div className="commerce-page-heading"><div><p>YOUR BUSINESS, AT A GLANCE</p><h2>A little more clarity.<br className="commerce-mobile-break" /> Every day.</h2><span>Here’s how your store is doing today.</span></div><button type="button" onClick={() => chooseView('billing')}><Plus size={15} /> New bill</button></div>
              <div className="commerce-stats"><div><span>Sales today <ArrowUpRight size={14} /></span><strong>₹24,850<small>.00</small></strong><p>18 bills recorded</p></div><div><span>Money collected <ArrowDownLeft size={14} /></span><strong>₹21,400<small>.00</small></strong><p>Cash and digital payments</p></div><div><span>Customer dues <Users size={14} /></span><strong>₹3,450<small>.00</small></strong><p>Across 3 customers</p></div></div>
              <div className="commerce-overview-bottom"><div className="commerce-sales"><div><strong>Sales this week</strong><span>₹1,32,650</span></div><div className="commerce-bars" role="img" aria-label="Sample daily sales: Monday 14,200, Tuesday 18,600, Wednesday 12,400, Thursday 22,100, Friday 16,800, Saturday 23,700, Sunday 24,850 rupees">{[39, 51, 34, 61, 46, 65, 69].map((height, i) => <div key={i}><div style={{ height: `${height}%` }} /><span>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</span></div>)}</div></div><div className="commerce-attention"><span>WORTH A LOOK</span><h3>Small details.<br />Taken care of.</h3><div><span><Boxes size={16} /></span><p><strong>2 items running low</strong><small>Keep your bestsellers ready.</small></p></div><div><span><Users size={16} /></span><p><strong>3 customer balances</strong><small>Know what’s still to come in.</small></p></div></div></div>
            </> : view === 'billing' ? <>
              <div className="commerce-page-heading"><div><p>BILLING / NEW BILL</p><h2>From product to payment.</h2><span>A clear bill. Everything in its place.</span></div><Receipt size={25} strokeWidth={1.3} /></div>
              <div className="commerce-billing-layout"><div className="commerce-bill"><div className="commerce-bill-client"><span><Users size={15} /> Walk-in customer</span><span>{saved ? 'Recorded in preview' : 'Draft bill'}</span></div><div className="commerce-bill-product"><span className="commerce-product-icon"><Package size={28} strokeWidth={1.3} /></span><div><strong>Everyday tote</strong><small>Natural / Standard</small><div className="commerce-quantity"><button type="button" aria-label="Remove one tote" disabled={quantity <= 1 || saved} onClick={() => setQuantity(n => n - 1)}>−</button><span>{quantity}</span><button type="button" aria-label="Add one tote" disabled={quantity >= 9 || saved} onClick={() => setQuantity(n => n + 1)}>+</button></div></div><strong>{money(quantity * 600)}</strong></div><div className="commerce-bill-summary"><span>Subtotal</span><span>{money(quantity * 600)}</span></div><div className="commerce-bill-total"><span>Total amount</span><strong>{money(quantity * 600)}<small>.00</small></strong></div><button className="commerce-save" type="button" disabled={saved} onClick={() => setSaved(true)}>{saved ? <><Check size={16} /> Sample bill recorded</> : <>Record sample bill <ArrowRight size={16} /></>}</button><p className="commerce-demo-note" role="status">{saved ? 'Preview only. No real bill or payment was created.' : 'Try changing the quantity, then record a sample bill.'}</p></div><div className="commerce-bill-aside"><span>THE DETAILS STAY CONNECTED</span><h3>One bill.<br />Less follow-up.</h3><p>In your workspace, each recorded sale connects the bill, stock movement and customer balance.</p><ul><li><Check size={14} /> Item and price together</li><li><Check size={14} /> Clear customer records</li><li><Check size={14} /> Payment recorded separately</li></ul></div></div>
            </> : <>
              <div className="commerce-page-heading"><div><p>PRODUCTS & STOCK</p><h2>Know what’s on the shelf.</h2><span>Your items, prices and quantities. Together.</span></div><Boxes size={25} strokeWidth={1.3} /></div>
              <div className="commerce-stock-table"><div className="commerce-stock-caption"><span><Search size={15} /> Sample product catalogue</span><span>4 items</span></div><table><thead><tr><th>Product</th><th>Price</th><th>In stock</th><th>Status</th></tr></thead><tbody>{[{ item: 'Everyday tote', detail: 'Natural / Standard', price: 600, stock: 24 }, { item: 'Ceramic mug', detail: 'Stone / 300 ml', price: 350, stock: 5 }, { item: 'Daily notebook', detail: 'A5 / Ruled', price: 180, stock: 42 }, { item: 'Steel bottle', detail: 'Silver / 750 ml', price: 850, stock: 3 }].map(item => <tr key={item.item}><td><span className="commerce-table-product"><span><Package size={18} strokeWidth={1.4} /></span><span><strong>{item.item}</strong><small>{item.detail}</small></span></span></td><td>{money(item.price)}</td><td>{item.stock} units</td><td><span className={`commerce-stock-status ${item.stock < 6 ? 'is-low' : ''}`}>{item.stock < 6 ? 'Low stock' : 'In stock'}</span></td></tr>)}</tbody></table></div>
            </>}
          </div>
        </div>
      </div>
      <div className="commerce-tour-controls"><div className="commerce-tour-tabs" role="tablist" aria-label="Explore the sample workspace">{views.map((item, index) => <button key={item.id} ref={node => { tabs.current[index] = node; }} type="button" id={`commerce-tab-${item.id}`} role="tab" aria-selected={view === item.id} aria-controls="commerce-tour-panel" tabIndex={view === item.id ? 0 : -1} onClick={() => chooseView(item.id)} onKeyDown={event => { let next = index; if (event.key === 'ArrowRight') next = (index + 1) % views.length; else if (event.key === 'ArrowLeft') next = (index + views.length - 1) % views.length; else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = views.length - 1; else return; event.preventDefault(); chooseView(views[next].id); tabs.current[next]?.focus(); }}><item.icon size={15} />{item.label}</button>)}</div><p>Illustrative example · sample figures</p></div>
    </div>
  );
}
