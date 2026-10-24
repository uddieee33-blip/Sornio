'use client';

import { useEffect, useRef } from 'react';
import { ArrowUpRight, BarChart3, Boxes, Check, ChevronRight, CreditCard, Home, Package, Receipt, Search, Users } from 'lucide-react';
import { BrandIcon } from '@/components/ui/BrandLogo';

/** Bounded pointer depth and scroll parallax; no render loop or animation dependency. */
export function CommerceScene() {
  const scene = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = scene.current;
    if (!node) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const precise = window.matchMedia('(hover: hover) and (pointer: fine)');
    let frame = 0;
    let x = 0;
    let y = 0;
    const enabled = () => !reduced.matches && precise.matches && document.documentElement.dataset.motion !== 'off' && document.documentElement.dataset.motion !== 'calm';
    const paint = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const active = enabled() && rect.bottom > 0 && rect.top < innerHeight;
      node.style.setProperty('--scene-rx', `${active ? -y * 3 : 0}deg`);
      node.style.setProperty('--scene-ry', `${active ? x * 4 : 0}deg`);
      node.style.setProperty('--scene-scroll', `${active ? Math.max(-28, Math.min(28, -rect.top * 0.055)) : 0}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
    const pointer = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      x = (event.clientX - rect.left) / rect.width * 2 - 1;
      y = (event.clientY - rect.top) / rect.height * 2 - 1;
      schedule();
    };
    const reset = () => { x = 0; y = 0; schedule(); };
    const settings = new MutationObserver(reset);
    settings.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    node.addEventListener('pointermove', pointer, { passive: true });
    node.addEventListener('pointerleave', reset);
    window.addEventListener('scroll', schedule, { passive: true });
    reduced.addEventListener('change', reset);
    precise.addEventListener('change', reset);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      settings.disconnect();
      node.removeEventListener('pointermove', pointer);
      node.removeEventListener('pointerleave', reset);
      window.removeEventListener('scroll', schedule);
      reduced.removeEventListener('change', reset);
      precise.removeEventListener('change', reset);
    };
  }, []);

  return <div ref={scene} className="commerce-scene" aria-label="Illustrative Sornio workspace with sample figures">
    <div className="commerce-orbit commerce-orbit-one" aria-hidden="true" />
    <div className="commerce-orbit commerce-orbit-two" aria-hidden="true" />
    <div className="commerce-scene-depth">
      <div className="commerce-brand-tile" aria-hidden="true"><BrandIcon size={122} priority /></div>
      <div className="commerce-window">
        <div className="commerce-window-bar"><span className="commerce-window-dots" aria-hidden="true"><i /><i /><i /></span><span><BrandIcon size={16} /> Sornio</span><Search size={13} aria-hidden="true" /></div>
        <div className="commerce-window-body">
          <div className="commerce-window-rail" aria-hidden="true">{[Home, Receipt, Package, Users, CreditCard, BarChart3].map((Icon, i) => <span key={i} className={i === 1 ? 'is-current' : ''}><Icon size={16} strokeWidth={1.7} /></span>)}</div>
          <div className="commerce-window-content">
            <div className="commerce-window-heading"><div><small>SALES / NEW BILL</small><h2>A good day for business.</h2></div><ArrowUpRight size={18} aria-hidden="true" /></div>
            <div className="commerce-bill-customer"><span><Users size={15} aria-hidden="true" />Walk-in customer</span><span>Unpaid bill</span></div>
            <div className="commerce-product-row"><span className="commerce-product-art"><Package size={25} strokeWidth={1.3} aria-hidden="true" /></span><span><strong>Everyday tote</strong><small>Natural / Standard</small></span><span>2 × ₹600</span></div>
            <div className="commerce-bill-total"><span>Bill total</span><strong>₹1,200<small>.00</small></strong></div>
            <div className="commerce-bill-button"><Receipt size={14} aria-hidden="true" />Save bill<ChevronRight size={14} aria-hidden="true" /></div>
            <div className="commerce-window-foot"><span className="commerce-status-dot" />Stock, customer balance and bill. Connected.</div>
          </div>
        </div>
      </div>
      <div className="commerce-floating-stock"><span className="commerce-floating-icon"><Boxes size={19} strokeWidth={1.6} aria-hidden="true" /></span><span><small>STOCK MOVEMENT</small><strong>Everything accounted for.</strong><span>2 units connected to this bill</span></span><Check size={16} aria-hidden="true" /></div>
      <div className="commerce-floating-note"><span><Check size={13} aria-hidden="true" /></span>Your business. In sync.</div>
    </div>
    <p className="commerce-scene-caption">Illustrative example · sample figures</p>
  </div>;
}
