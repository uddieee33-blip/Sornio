'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowDownToLine, ArrowRight, BarChart3, Boxes, Check, Menu, Monitor, Receipt, Users, X } from 'lucide-react';
import { BusinessShowcase } from '@/components/brand/business-showcase';
import { CommerceScene } from '@/components/brand/commerce-scene';
import { Reveal } from '@/components/motion/reveal';
import { BrandIcon } from '@/components/ui/BrandLogo';
import { AppearanceMenu } from '@/components/theme/appearance-menu';
import { LanguagePicker } from '@/components/ui/LanguagePicker';
import { useI18n } from '@/lib/i18n';
import { PLAN_CATALOGUE, monthlyEquivalent, type BillingInterval } from '@/lib/plans';

const navigation = [
  { label: 'For your business', href: '#businesses' },
  { label: 'Features', href: '#features' },
  { label: 'Plans', href: '#pricing' },
  { label: 'Windows', href: '#windows' },
];
const features = [
  { icon: Receipt, title: 'Billing that keeps up.', description: 'Create bills, print receipts and keep each sale connected to your records.' },
  { icon: Boxes, title: 'Know what is in stock.', description: 'Manage items, prices and stock movements without a separate notebook.' },
  { icon: Users, title: 'Keep customer dues clear.', description: 'See who owes what, record collections and prepare payment reminders.' },
  { icon: BarChart3, title: 'See the day clearly.', description: 'Follow sales, expenses and cash flow from the entries your business records.' },
];
const questions = [
  { question: 'Can I start without adding bank details?', answer: 'Yes. Set up your business and start recording your work. You can add your own UPI ID and bank details later.' },
  { question: 'Does Sornio receive my customers’ payments?', answer: 'Your UPI collection QR uses your own UPI ID. Customers pay your account directly. A QR or payment reference is not confirmation that money has settled.' },
  { question: 'Does the Windows app work fully offline?', answer: 'The current Windows preview needs an internet connection. A desktop app that can start and run fully offline is in development.' },
  { question: 'Are WhatsApp and SMS reminders automatic?', answer: 'Current reminders prepare a message for you to send. Automatic sending and delivery tracking are not yet connected.' },
];
function intervalLabel(interval: BillingInterval) {
  switch (interval) {
    case 'month': return '/ month';
    case 'quarter': return '/ 3 months';
    case 'year': return '/ year';
    default: return 'forever';
  }
}

export default function LandingPage() {
  const { t, locale } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [intervals, setIntervals] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus(); }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [menuOpen]);

  return (
    <div className="sornio-site">
      <header className="sornio-site-header">
        <div className="sornio-container sornio-header-row">
          <Link href="/" aria-label="Sornio home" className="sornio-brand"><BrandIcon size={38} priority className="sornio-brand-icon" /><span>Sornio</span></Link>
          <nav aria-label="Main navigation" className="sornio-desktop-links">{navigation.map(item => <a key={item.href} href={item.href}>{item.label}</a>)}</nav>
          <div className="sornio-header-actions">
            <AppearanceMenu /><span className="sornio-desktop-language"><LanguagePicker /></span>
            <Link href="/auth" className="sornio-sign-in">{t('nav.signIn')}</Link>
            <Link href="/auth?mode=signup" className="sornio-button sornio-button-small">Get started <ArrowRight size={14} aria-hidden="true" /></Link>
            <button ref={menuButton} type="button" className="sornio-menu-toggle" onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen} aria-controls="sornio-mobile-menu" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </div>
        {menuOpen ? <nav id="sornio-mobile-menu" aria-label="Mobile navigation" className="sornio-container sornio-mobile-menu">
          {navigation.map(item => <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}<ArrowRight size={15} aria-hidden="true" /></a>)}
          <Link href="/auth" onClick={() => setMenuOpen(false)}>{t('nav.signIn')}<ArrowRight size={15} aria-hidden="true" /></Link><LanguagePicker />
        </nav> : null}
      </header>
      <main id="main">
        <section id="overview" className="sornio-hero-wrap">
          <div className="sornio-container sornio-hero">
            <Reveal className="sornio-hero-copy">
              <p className="sornio-eyebrow"><span /> BUILT FOR EVERYDAY COMMERCE</p>
              <h1>Small business.<br /><span>Big possibilities.</span></h1>
              <p className="sornio-hero-description">The shop you open every morning deserves a bigger future. Bring your billing, stock, customers and money together with Sornio.</p>
              <div className="sornio-hero-actions"><Link href="/auth?mode=signup" className="sornio-button">Build your next chapter <ArrowRight size={18} aria-hidden="true" /></Link><a href="#workspace" className="sornio-text-link">Explore the workspace <ArrowDown size={16} aria-hidden="true" /></a></div>
              <p className="sornio-hero-note">Start free · No card needed · Made for India</p>
            </Reveal>
            <div className="sornio-hero-art" aria-label="Illustrative Sornio business records with sample figures">
              <div className="sornio-orbit sornio-orbit-one" aria-hidden="true" /><div className="sornio-orbit sornio-orbit-two" aria-hidden="true" />
              <span className="sornio-art-caption">A LITTLE CLARITY. A LOT OF POTENTIAL.</span>
              <div className="sornio-art-sales"><span><BarChart3 size={16} aria-hidden="true" /> Your day, connected</span><strong>₹24,850<small>Sales today · sample</small></strong><div className="sornio-art-bars" aria-hidden="true">{[30, 48, 40, 63, 54, 76, 95].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><p>Every entry brings the picture into focus.</p></div>
              <div className="sornio-art-receipt"><span><BrandIcon size={24} /> Sornio</span><p>THE EVERYDAY STORE</p><div><span>Everyday tote × 2</span><strong>₹1,200</strong></div><div><span>Ceramic mug × 1</span><strong>₹350</strong></div><div className="sornio-art-total"><span>Total</span><strong>₹1,550</strong></div><small>Illustrative bill · sample figures</small></div>
              <div className="sornio-art-stock"><span><Boxes size={19} aria-hidden="true" /></span><div><strong>Stock. In sight.</strong><small>Your next sale starts here.</small></div><Check size={17} aria-hidden="true" /></div>
              <span className="sornio-art-bottom">YOUR COUNTER. YOUR AMBITION. YOUR SORNIO.</span>
            </div>
          </div>
        </section>
        <div className="sornio-container sornio-business-strip"><span>SMALL BUSINESS, BIG NUMBERS.</span><p>Built around your day <i /> Ready for your next chapter</p></div>
        <BusinessShowcase />
        <section id="workspace" className="sornio-container sornio-workspace-section"><div className="sornio-section-heading"><div><p className="sornio-eyebrow">TAKE IT FOR A SPIN</p><h2>Less explaining.<br /><span>More exploring.</span></h2></div><p>Try a sample bill, adjust a quantity, or explore the stock list. This preview uses sample records.</p></div><CommerceScene /></section>
        <section id="features" className="sornio-container sornio-section">
          <div className="sornio-section-heading"><div><p className="sornio-eyebrow">LESS FRICTION. MORE FLOW.</p><h2>The whole day.<br /><span>In good order.</span></h2></div><p>Open your shop. Make a sale. Know where you stand. The essentials work together, with a clear place for every detail.</p></div>
          <div className="sornio-feature-grid">{features.map((feature, index) => <Reveal as="article" key={feature.title} index={index} className="sornio-feature-card"><div><span className="sornio-feature-index">0{index + 1}</span><feature.icon size={24} strokeWidth={1.5} aria-hidden="true" /></div><h3>{feature.title}</h3><p>{feature.description}</p></Reveal>)}</div>
        </section>
        <section id="windows" className="sornio-container sornio-windows-section">
          <div className="sornio-windows-symbol" aria-hidden="true"><div><BrandIcon size={76} /></div><Monitor size={160} strokeWidth={0.8} /></div>
          <div><p className="sornio-eyebrow">AT HOME ON YOUR COUNTER</p><h2>Made for the desk<br />behind the business.</h2><p>Keep Sornio within reach on the computer you use for your business. Explore installation options and the current desktop preview.</p><p className="sornio-release-note">The Windows preview currently requires internet. Fully offline working is in development.</p></div>
          <Link href="/install" className="sornio-button sornio-button-secondary"><ArrowDownToLine size={17} aria-hidden="true" /> Windows installation</Link>
        </section>
        <section id="pricing" className="sornio-container sornio-section">
          <div className="sornio-section-heading"><div><p className="sornio-eyebrow">ROOM TO GROW</p><h2>Start small.<br /><span>Keep growing.</span></h2></div><p>Start with the essentials. Compare the plans and choose what fits your business.</p></div>
          <div className="sornio-plan-grid">{PLAN_CATALOGUE.filter(plan => plan.id !== 'trial').map(plan => {
            const selected = intervals[plan.id] ?? 0;
            const price = plan.prices[selected] ?? plan.prices[0];
            const monthly = monthlyEquivalent(plan, selected);
            return <article key={plan.id} className={`sornio-plan-card ${plan.popular ? 'sornio-plan-emphasis' : ''}`}>
              <div className="sornio-plan-title"><h3>{plan.name}</h3>{plan.popular ? <span>GROW WITH SORNIO</span> : null}</div>
              <p className="sornio-plan-description">{plan.tagline}</p>
              <div className="sornio-plan-options" aria-label={`${plan.name} billing period`}>{plan.prices.map((option, index) => <button key={option.interval} type="button" aria-pressed={selected === index} onClick={() => setIntervals(current => ({ ...current, [plan.id]: index }))}>{option.interval === 'forever' ? 'Free' : option.interval === 'month' ? 'Monthly' : option.interval === 'quarter' ? 'Quarterly' : 'Yearly'}</button>)}</div>
              <p className="sornio-plan-price"><strong>₹{price.amount.toLocaleString(locale)}</strong><span>{intervalLabel(price.interval)}</span></p>
              <p className="sornio-plan-monthly">{monthly && monthly > 0 ? `Equivalent to ₹${monthly.toLocaleString(locale)} / month` : 'Start with the free essentials'}</p>
              <ul>{plan.highlights.map(item => <li key={item}><Check size={15} aria-hidden="true" />{item}</li>)}</ul>
              {plan.excluded.length ? <p className="sornio-plan-excluded">{plan.excluded.join(' · ')}</p> : null}
              <Link href={price.amount === 0 ? '/auth?mode=signup' : `/auth?mode=signup&plan=${plan.id}&interval=${price.interval}`} className={`sornio-button ${plan.popular ? '' : 'sornio-button-secondary'}`}>{price.amount === 0 ? 'Start free' : `Explore ${plan.name}`}<ArrowRight size={15} aria-hidden="true" /></Link>
            </article>;
          })}</div>
          <p className="sornio-pricing-note">Message reminders currently prepare drafts for you to send. Automatic WhatsApp and SMS delivery is not yet connected.</p>
        </section>
        <section className="sornio-container sornio-section sornio-faq"><div><p className="sornio-eyebrow">A FEW USEFUL DETAILS</p><h2>Before you begin.</h2></div><div>{questions.map(item => <details key={item.question}><summary>{item.question}<span aria-hidden="true">+</span></summary><p>{item.answer}</p></details>)}</div></section>
        <section className="sornio-container sornio-final-cta"><p className="sornio-eyebrow">YOUR NEXT CHAPTER</p><h2>Your ambition.<br /><span>Now open for business.</span></h2><p>Start with the essentials. Make space for what comes next.</p><Link href="/auth?mode=signup" className="sornio-button">Get started <ArrowRight size={17} aria-hidden="true" /></Link></section>
      </main>
      <footer className="sornio-site-footer"><div className="sornio-container"><Link href="/" className="sornio-brand"><BrandIcon size={30} /><span>Sornio</span></Link><p>Everyday commerce. Thoughtfully connected.</p><nav aria-label="Footer"><Link href="/install">Installation</Link><a href="#pricing">Plans</a><Link href="/auth">Sign in</Link></nav></div></footer>
    </div>
  );
}
