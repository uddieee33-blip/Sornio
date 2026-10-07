'use client';

/**
 * Everything On — the owner-facing control.
 *
 * A switch that quietly widens a console would be worse than no switch, so
 * this card is written to be read before it is tapped. It states, in order:
 * what the trade's portal carries today, exactly which screens are being held
 * back and why, what turning it on does, what it explicitly cannot do, and
 * when it lapses.
 *
 * The last two matter most. "Everything On" sounds like it unlocks the paid
 * tier, and it does not — the plan check runs in a later middleware step
 * against a different signed cookie and never sees this one. And it expires
 * after ninety days on purpose: a switch that stays on forever stops being a
 * decision and becomes the product's real default, at which point the portal
 * system is decoration.
 */

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Check, Grid3x3, Info, Loader2, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/Card';
import { usePortal } from '@/lib/portals/portal-provider';
import { useMasterSwitch } from '@/lib/portals/master-client';
import { disabledModules } from '@/lib/portals/registry';
import { useDukaanStore } from '@/lib/store';

export function EverythingSwitch() {
  const { portal, portalNav, revealAll } = usePortal();
  const { daysLeft, busy, error, set } = useMasterSwitch();
  const { actions } = useDukaanStore();
  const [confirming, setConfirming] = useState(false);

  const carried = portalNav.flatMap((section) => section.links);
  const held = disabledModules(portal.id);

  const toggle = async (next: boolean) => {
    const ok = await set(next);
    if (!ok) return;
    setConfirming(false);
    // The audit trail records the shape of the console changing, the same way
    // it records a price or a setting changing — in the same hash chain, so
    // "why does this screen exist now?" has an answer with a timestamp on it.
    actions.recordConsoleEvent(
      next
        ? `Everything On — all 27 modules revealed over the ${portal.name} portal. Paid modules are unaffected.`
        : `Everything On switched off — console back to the ${portal.name} portal shape.`,
    );
  };

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CardTitle icon={<Grid3x3 size={15} />}>Everything On</CardTitle>
        {revealAll ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-500/25">
            <Check size={12} /> Live · {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-600 ring-1 ring-inset ring-stone-200">
            Off · {portal.name} shape
          </span>
        )}
      </div>

      <p className="mt-2 text-sm leading-relaxed text-stone-600">
        Your console is shaped for a <span className="font-semibold text-stone-900">{portal.name}</span>, which is why{' '}
        {held.length === 0 ? 'every' : `${carried.length} of the 27`} modules are on the menu. Some businesses are
        genuinely two businesses — a cafe that sells beans by the kilo, a salon with a retail counter. This reveals all
        27 at once, without changing your business type, your words, or a single record.
      </p>

      {/* ------------------------------------------------- what is held back */}
      {held.length > 0 ? (
        <div className="mt-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">
            {revealAll ? 'Revealed by this switch' : `Held back by the ${portal.name} portal`}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {held.map((item) => (
              <span
                key={item.module}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition-colors duration-base ${
                  revealAll
                    ? 'bg-portal/10 text-portal ring-portal/25'
                    : 'bg-white text-stone-500 ring-stone-200'
                }`}
              >
                {item.label}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-stone-500">{portal.excluded}</p>
        </div>
      ) : null}

      {/* ------------------------------------------------- what it cannot do */}
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <div className="rounded-2xl bg-emerald-500/[0.07] p-3.5 ring-1 ring-inset ring-emerald-500/20">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
            <Sparkles size={12} /> What it does
          </p>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-stone-600">
            <li>Puts all 27 modules in the sidebar and in ⌘K, under “Everything else”.</li>
            <li>Lets the edge serve those routes instead of sending you back to the cockpit.</li>
            <li>Leaves your trade’s words, accent and cockpit exactly as they are.</li>
          </ul>
        </div>
        <div className="rounded-2xl bg-amber-500/[0.07] p-3.5 ring-1 ring-inset ring-amber-500/25">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
            <Lock size={12} /> What it cannot do
          </p>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-stone-600">
            <li>
              It does not unlock a paid module.{' '}
              <Link href="/subscription" className="font-semibold text-stone-700 underline-offset-2 hover:underline">
                Your plan
              </Link>{' '}
              is checked separately, after this, against its own signed cookie.
            </li>
            <li>It cannot be switched on by editing a cookie — the value is signed with this deployment’s key.</li>
            <li>It cannot create data. An empty module stays empty until you record something in it.</li>
          </ul>
        </div>
      </div>

      {/* ------------------------------------------------------------ action */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {revealAll ? (
          <button
            type="button"
            onClick={() => toggle(false)}
            disabled={busy}
            className="touch-manipulation inline-flex min-h-11 items-center gap-2 rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-900 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-200 disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Grid3x3 size={15} />}
            Go back to the {portal.name} shape
          </button>
        ) : confirming ? (
          <>
            <button
              type="button"
              onClick={() => toggle(true)}
              disabled={busy}
              className="bg-portal-gradient portal-glow touch-manipulation inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              Yes — reveal all 27 modules
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="touch-manipulation inline-flex min-h-11 items-center gap-2 rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-200"
            >
              Not now
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="bg-portal-gradient portal-glow touch-manipulation inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            <Grid3x3 size={15} /> Turn everything on
          </button>
        )}

        <span className="inline-flex items-center gap-1.5 text-[11px] text-stone-500">
          <CalendarClock size={12} /> Lapses after 90 days, back to your trade’s own shape.
        </span>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-500/25">
          {error}
        </p>
      ) : null}

      <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-stone-500">
        <Info size={12} className="mt-0.5 shrink-0" />
        Nothing is deleted either way, and switching back and forth keeps every record exactly where it is. The reveal
        is recorded in your{' '}
        <Link href="/audit" className="font-semibold text-stone-600 underline-offset-2 hover:underline">
          audit history
        </Link>
        , and how it is enforced is shown live in the{' '}
        <Link href="/security" className="font-semibold text-stone-600 underline-offset-2 hover:underline">
          Trust Centre
        </Link>
        . <ShieldCheck size={12} className="inline" />
      </p>
    </Card>
  );
}
