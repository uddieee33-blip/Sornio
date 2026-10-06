'use client';

/**
 * Check-ins — the front desk.
 *
 * Only portals that carry the check-in module can reach this page (the Edge
 * middleware redirects everyone else), which is exactly why it can be built for
 * one job: who is on the floor right now, and who walked in today.
 *
 * Every entry is attached to a real member record, and the visit log is a
 * record the owner can trust — it is never seeded, invented, or rounded.
 */

import { useMemo, useState } from 'react';
import { CalendarCheck, DoorOpen, LogOut, Search, UserCheck, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDukaanStore } from '@/lib/store';
import { usePortal } from '@/lib/portals/portal-provider';

const inputClass =
  'w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 placeholder-stone-500 outline-none transition focus:border-portal/50 focus:ring-2 focus:ring-portal/20';

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const todayKey = () => new Date().toISOString().slice(0, 10);

export default function CheckInsPage() {
  const { state, actions, hydrated } = useDukaanStore();
  const { terms } = usePortal();
  const [query, setQuery] = useState('');
  const [flash, setFlash] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const today = todayKey();
  const todaysVisits = useMemo(
    () => state.checkIns.filter((entry) => entry.at.slice(0, 10) === today).sort((a, b) => b.at.localeCompare(a.at)),
    [state.checkIns, today],
  );
  const onFloor = todaysVisits.filter((entry) => !entry.outAt);

  // Anyone with an open visit is already inside, so they are not offered again.
  const notIn = useMemo(() => {
    const openMemberIds = new Set(state.checkIns.filter((entry) => !entry.outAt).map((entry) => entry.memberId));
    const needle = query.trim().toLowerCase();
    return state.members
      .filter((member) => !openMemberIds.has(member.id))
      .filter((member) => (needle ? `${member.name} ${member.phone}`.toLowerCase().includes(needle) : true))
      .slice(0, 12);
  }, [state.members, state.checkIns, query]);

  const note = (tone: 'ok' | 'error', text: string) => {
    setFlash({ tone, text });
    setTimeout(() => setFlash(null), 2400);
  };

  const checkIn = (memberId: string, name: string) => {
    const result = actions.checkInMember({ memberId });
    note(result.ok ? 'ok' : 'error', result.ok ? `${name} checked in.` : result.error ?? 'Could not check in.');
  };

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-8">
      <PageHeader
        eyebrow={`${terms.desk} · attendance`}
        title="Who is in right now"
        subtitle={`One tap records a visit against the ${terms.customerOne.toLowerCase()}'s own record — no paper register, no double entry, and the history stays with them.`}
      />

      {flash ? (
        <div
          className={`mb-6 rounded-xl px-3.5 py-2.5 text-sm ring-1 ring-inset animate-fade-in ${
            flash.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' : 'bg-red-500/10 text-red-700 ring-red-500/20'
          }`}
        >
          {flash.text}
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-portal/[0.07] p-5 ring-1 ring-inset ring-portal/20">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-portal">
            <UserCheck size={13} /> On the floor now
          </p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums text-stone-900">{onFloor.length}</p>
          <p className="mt-0.5 text-[11px] text-stone-600">not yet checked out</p>
        </div>
        <div className="rounded-2xl bg-stone-50 p-5 ring-1 ring-inset ring-stone-200">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-stone-600">
            <CalendarCheck size={13} /> Visits today
          </p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums text-stone-900">{todaysVisits.length}</p>
          <p className="mt-0.5 text-[11px] text-stone-600">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="rounded-2xl bg-stone-50 p-5 ring-1 ring-inset ring-stone-200">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-stone-600">
            <Users size={13} /> {terms.customers} on file
          </p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums text-stone-900">{state.members.length}</p>
          <p className="mt-0.5 text-[11px] text-stone-600">searchable below</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="animate-fade-up h-fit">
          <div className="mb-4 flex items-center justify-between gap-3">
            <CardTitle icon={<DoorOpen size={17} />}>Check someone in</CardTitle>
            <Badge tone="slate">{notIn.length} shown</Badge>
          </div>

          <div className="relative mb-3">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${terms.customers.toLowerCase()} by name or phone…`}
              className={`${inputClass} pl-9`}
              aria-label={`Search ${terms.customers}`}
            />
          </div>

          {state.members.length === 0 ? (
            <p className="rounded-xl bg-stone-50 p-4 text-xs leading-relaxed text-stone-600 ring-1 ring-inset ring-stone-200">
              No {terms.customers.toLowerCase()} on record yet. Add one from {terms.customers} first — a check-in always belongs to a person.
            </p>
          ) : notIn.length === 0 ? (
            <p className="rounded-xl bg-emerald-500/[0.07] p-4 text-xs leading-relaxed text-emerald-800 ring-1 ring-inset ring-emerald-500/20">
              Everyone matching that search is already inside. {onFloor.length} on the floor right now.
            </p>
          ) : (
            <ul className="max-h-[420px] divide-y divide-stone-100 overflow-y-auto">
              {notIn.map((member) => (
                <li key={member.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-[11px] font-bold text-stone-700">
                    {member.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-stone-900">{member.name}</p>
                    <p className="truncate text-[11px] text-stone-600">{member.phone}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => checkIn(member.id, member.name)}
                    className="bg-portal-gradient shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold text-white transition hover:brightness-110"
                  >
                    Check in
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="animate-fade-up">
          <div className="mb-4 flex items-center justify-between">
            <CardTitle icon={<CalendarCheck size={17} />}>Today’s visit log</CardTitle>
            {onFloor.length > 0 ? <Badge tone="emerald" dot>{onFloor.length} inside</Badge> : <Badge tone="slate">All closed</Badge>}
          </div>

          {!hydrated ? (
            <p className="text-xs text-stone-500">Reading this device…</p>
          ) : todaysVisits.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="Nobody has walked in yet today"
              description={`Check the first ${terms.customerOne.toLowerCase()} in from the list on the left — the visit is recorded against their own record, and the cockpit counts it immediately.`}
            />
          ) : (
            <ul className="divide-y divide-stone-100">
              {todaysVisits.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2.5">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${entry.outAt ? 'bg-stone-300' : 'bg-emerald-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-stone-900">{entry.name}</p>
                    <p className="truncate text-[11px] text-stone-600">
                      In {timeOf(entry.at)}
                      {entry.outAt ? ` · out ${timeOf(entry.outAt)}` : ' · still inside'}
                      {entry.by ? ` · ${entry.by}` : ''}
                    </p>
                  </div>
                  {entry.outAt ? (
                    <span className="shrink-0 text-[11px] font-semibold text-stone-500">
                      {Math.max(1, Math.round((new Date(entry.outAt).getTime() - new Date(entry.at).getTime()) / 60000))} min
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => actions.endCheckIn(entry.id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-200"
                    >
                      <LogOut size={11} /> Check out
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
