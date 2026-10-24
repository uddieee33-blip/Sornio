'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDownToLine, ArrowRight, BarChart3, Boxes, Check, CreditCard, LayoutDashboard, Menu, Monitor, Receipt, Users, X } from 'lucide-react';
import { BrandIcon } from '@/components/ui/BrandLogo';
import { AppearanceMenu } from '@/components/theme/appearance-menu';
import { LanguagePicker } from '@/components/ui/LanguagePicker';
import { useI18n } from '@/lib/i18n';
import { PLAN_CATALOGUE, monthlyEquivalent, type BillingInterval } from '@/lib/plans';

const navigation = [
  { label: 'Overview', href: '#overview' },
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
            <Link href="/auth" className="sornio-button sornio-button-small">Get started <ArrowRight size={14} aria-hidden="true" /></Link>
            <button ref={menuButton} type="button" className="sornio-menu-toggle" onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen} aria-controls="sornio-mobile-menu" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </div>
        {menuOpen ? <nav id="sornio-mobile-menu" aria-label="Mobile navigation" className="sornio-container sornio-mobile-menu">
          {navigation.map(item => <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}<ArrowRight size={15} aria-hidden="true" /></a>)}
          <Link href="/auth" onClick={() => setMenuOpen(false)}>{t('nav.signIn')}<ArrowRight size={15} aria-hidden="true" /></Link><LanguagePicker />
        </nav> : null}
      </header>
      <main id="main">
        <section id="overview" className="sornio-container sornio-hero">
          <div className="sornio-hero-copy">
            <p className="sornio-eyebrow">BUSINESS MANAGEMENT, SIMPLIFIED</p>
            <h1>Your business.<br /><span>A clearer view.</span></h1>
            <p className="sornio-hero-description">Bring your billing, stock and customer dues into one calm, organised workspace. Less to keep track of. More clarity for the day ahead.</p>
            <div className="sornio-hero-actions"><Link href="/auth" className="sornio-button">Start with Sornio <ArrowRight size={17} aria-hidden="true" /></Link><a href="#features" className="sornio-button sornio-button-secondary">Explore the workspace</a></div>
            <p className="sornio-hero-note">Start free · Add your business · Make it yours</p>
          </div>
          <div className="sornio-product-preview" aria-label="Illustrative empty Sornio workspace">
            <div className="sornio-preview-top"><span className="sornio-preview-brand"><BrandIcon size={24} /> Sornio</span><span className="sornio-preview-label">WORKSPACE PREVIEW</span></div>
            <div className="sornio-preview-body">
              <div className="sornio-preview-rail" aria-hidden="true"><LayoutDashboard size={19} /><Receipt size={19} /><Boxes size={19} /><Users size={19} /><BarChart3 size={19} /></div>
              <div className="sornio-preview-content">
                <div className="sornio-preview-heading"><div><span>Your business</span><h2>A fresh start.</h2></div><span className="sornio-preview-day">Today</span></div>
                <div className="sornio-preview-totals"><div><span>Sales today</span><strong>₹0</strong></div><div><span>Customer dues</span><strong>₹0</strong></div><div><span>Items in stock</span><strong>0</strong></div></div>
                <div className="sornio-preview-empty"><span className="sornio-receipt-symbol"><Receipt size={25} strokeWidth={1.5} aria-hidden="true" /></span><h3>Your first sale starts here.</h3><p>Your records appear as you add your own business activity.</p><Link href="/auth?next=/billing">Create your first bill <ArrowRight size={14} aria-hidden="true" /></Link></div>
                <div className="sornio-preview-bottom"><span><CreditCard size={14} aria-hidden="true" /> Your payments. Your account.</span><span>Ready when you are</span></div>
              </div>
            </div>
            <p className="sornio-preview-caption">Illustrative empty workspace. Your figures come from your own entries.</p>
          </div>
        </section>
        <div className="sornio-container sornio-business-strip"><span>MADE FOR EVERYDAY BUSINESS</span><p>Retail shops <i /> Cafés <i /> Salons <i /> Gyms <i /> Growing teams</p></div>
        <section id="features" className="sornio-container sornio-section">
          <div className="sornio-section-heading"><div><p className="sornio-eyebrow">A PLACE FOR THE ESSENTIALS</p><h2>One workspace.<br />A more organised day.</h2></div><p>Start with the tasks you do every day. Keep the details connected as your business grows.</p></div>
          <div className="sornio-feature-grid">{features.map(feature => <article key={feature.title} className="sornio-feature-card"><feature.icon size={24} strokeWidth={1.5} aria-hidden="true" /><h3>{feature.title}</h3><p>{feature.description}</p></article>)}</div>
        </section>
        <section id="windows" className="sornio-container sornio-windows-section">
          <div className="sornio-windows-symbol" aria-hidden="true"><Monitor size={46} strokeWidth={1.1} /><BrandIcon size={42} /></div>
          <div><p className="sornio-eyebrow">AT HOME ON YOUR COUNTER</p><h2>A workspace for your Windows desk.</h2><p>Keep Sornio within reach on the computer you use for your business. Explore installation options and the current desktop preview.</p><p className="sornio-release-note">The Windows preview currently requires internet. Fully offline working is in development.</p></div>
          <Link href="/install" className="sornio-button sornio-button-secondary"><ArrowDownToLine size={17} aria-hidden="true" /> Windows installation</Link>
        </section>
        <section id="pricing" className="sornio-container sornio-section">
          <div className="sornio-section-heading"><div><p className="sornio-eyebrow">ROOM TO GROW</p><h2>A plan for your next step.</h2></div><p>Start with the essentials. Compare the plans and choose what fits your business.</p></div>
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
              <Link href={price.amount === 0 ? '/auth' : `/auth?plan=${plan.id}&interval=${price.interval}`} className={`sornio-button ${plan.popular ? '' : 'sornio-button-secondary'}`}>{price.amount === 0 ? 'Start free' : `Explore ${plan.name}`}<ArrowRight size={15} aria-hidden="true" /></Link>
            </article>;
          })}</div>
          <p className="sornio-pricing-note">Message reminders currently prepare drafts for you to send. Automatic WhatsApp and SMS delivery is not yet connected.</p>
        </section>
        <section className="sornio-container sornio-section sornio-faq"><div><p className="sornio-eyebrow">A FEW USEFUL DETAILS</p><h2>Before you begin.</h2></div><div>{questions.map(item => <details key={item.question}><summary>{item.question}<span aria-hidden="true">+</span></summary><p>{item.answer}</p></details>)}</div></section>
        <section className="sornio-container sornio-final-cta"><BrandIcon size={52} /><h2>Make room for a clearer day.</h2><p>Your business, brought together with Sornio.</p><Link href="/auth" className="sornio-button">Get started <ArrowRight size={17} aria-hidden="true" /></Link></section>
      </main>
      <footer className="sornio-site-footer"><div className="sornio-container"><Link href="/" className="sornio-brand"><BrandIcon size={30} /><span>Sornio</span></Link><p>Business management, simplified.</p><nav aria-label="Footer"><Link href="/install">Installation</Link><a href="#pricing">Plans</a><Link href="/auth">Sign in</Link></nav></div></footer>
    </div>
  );
}
