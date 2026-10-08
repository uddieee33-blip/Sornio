'use client';

import { getActiveFormattingLocale } from '@/lib/locale';

import { useLocaleRefresh } from '@/lib/i18n';

/**
 * The day book.
 *
 * Salons, studios, clinics and repair desks run on a book, not a catalogue. This
 * page is that book: one day at a time, with the three states that matter
 * (booked → arrived → done) and nothing else to configure.
 *
 * Completing a booking with a value records the revenue exactly once — the
 * store guarantees that — so the day book and the ledger can never drift.
 */

import { useMemo, useState } from 'react';
import { CalendarClock, CalendarPlus, CheckCircle2, Clock, Phone, User, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/business-data';
import { useDukaanStore, type Appointment } from '@/lib/store';
import { usePortal } from '@/lib/portals/portal-provider';

const inputClass =
  'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder-stone-500 outline-none transition focus:border-portal/50 focus:ring-2 focus:ring-focus';
const labelClass = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-stone-600';

const todayKey = () => new Date().toISOString().slice(0, 10);
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(getActiveFormattingLocale(), { hour: 'numeric', minute: '2-digit' });
const dateLong = (key: string) => new Date(`${key}T00:00:00`).toLocaleDateString(getActiveFormattingLocale(), { weekday: 'long', day: 'numeric', month: 'long' });

const STATUS_META: Record<Appointment['status'], { label: string; tone: 'slate' | 'amber' | 'emerald' | 'red' }> = {
  booked: { label: 'Booked', tone: 'slate' },
  arrived: { label: 'Arrived', tone: 'amber' },
  done: { label: 'Completed', tone: 'emerald' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

export default function AppointmentsPage() {
  useLocaleRefresh();
  const { state, actions } = useDukaanStore();
  const { terms } = usePortal();

  const [date, setDate] = useState(todayKey());
  const [form, setForm] = useState({ customerName: '', phone: '', service: '', staff: '', time: '11:00', minutes: '45', amount: '' });
  const [showForm, setShowForm] = useState(false);
  const [flash, setFlash] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const services = state.products.filter((product) => product.status === 'Active');

  const dayBook = useMemo(
    () => state.appointments.filter((appointment) => appointment.startAt.slice(0, 10) === date).sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [state.appointments, date],
  );

  const nextSevenDays = useMemo(() => {
    const start = todayKey();
    return state.appointments.filter((appointment) => {
      const key = appointment.startAt.slice(0, 10);
      const horizon = new Date(new Date().getTime() + 7 * 864e5).toISOString().slice(0, 10);
      return appointment.status === 'booked' && key >= start && key <= horizon;
    }).length;
  }, [state.appointments]);

  const bookedValue = dayBook
    .filter((appointment) => appointment.status !== 'cancelled')
    .reduce((total, appointment) => total + (appointment.amount ?? 0), 0);

  const note = (tone: 'ok' | 'error', text: string) => {
    setFlash({ tone, text });
    setTimeout(() => setFlash(null), 2600);
  };

  const submit = () => {
    const startAt = new Date(`${date}T${form.time}:00`);
    const result = actions.addAppointment({
      customerName: form.customerName,
      phone: form.phone || undefined,
      service: form.service || undefined,
      staff: form.staff || undefined,
      startAt: startAt.toISOString(),
      minutes: Number(form.minutes) || 45,
      amount: form.amount === '' ? undefined : Number(form.amount),
    });
    if (!result.ok) {
      note('error', result.error ?? 'Could not save the booking.');
      return;
    }
    note('ok', `Booked ${form.customerName} for ${timeOf(startAt.toISOString())}.`);
    setForm({ customerName: '', phone: '', service: '', staff: '', time: '11:00', minutes: '45', amount: '' });
    setShowForm(false);
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 md:p-8">
      <PageHeader
        eyebrow={`${terms.desk} · day book`}
        title="Today’s bookings"
        subtitle={`Every slot in one place, with the three states that matter: booked, arrived, completed. Marking a slot done with an amount records the ${terms.saleOne.toLowerCase()} once — the ledger follows the book.`}
        actions={
          <div className="flex items-center gap-2">
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={`${inputClass} w-auto`} aria-label="Choose a date" />
            <Button onClick={() => setShowForm((open) => !open)}>
              <CalendarPlus size={16} /> {showForm ? 'Close' : 'New booking'}
            </Button>
          </div>
        }
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

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-portal/[0.07] p-5 ring-1 ring-inset ring-portal/20">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-portal">
            <CalendarClock size={13} /> {dateLong(date)}
          </p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums text-stone-900">{dayBook.length}</p>
          <p className="mt-0.5 text-[11px] text-stone-600">slots in the book</p>
        </div>
        <div className="rounded-2xl bg-stone-50 p-5 ring-1 ring-inset ring-stone-200">
          <p className="text-[11px] font-bold uppercase tracking-wide text-stone-600">Value booked</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums text-stone-900">{formatCurrency(bookedValue)}</p>
          <p className="mt-0.5 text-[11px] text-stone-600">counted as revenue when completed</p>
        </div>
        <div className="rounded-2xl bg-stone-50 p-5 ring-1 ring-inset ring-stone-200">
          <p className="text-[11px] font-bold uppercase tracking-wide text-stone-600">Coming up (7 days)</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums text-stone-900">{nextSevenDays}</p>
          <p className="mt-0.5 text-[11px] text-stone-600">still booked, not yet served</p>
        </div>
      </div>

      {showForm ? (
        <Card className="mb-6 animate-fade-up">
          <CardTitle icon={<CalendarPlus size={17} />}>Add a booking</CardTitle>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <span className={labelClass}>Name</span>
              <input className={inputClass} value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="Client name" />
            </div>
            <div>
              <span className={labelClass}>Phone (optional)</span>
              <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 …" />
            </div>
            <div>
              <span className={labelClass}>Service</span>
              <input
                className={inputClass}
                list="service-options"
                value={form.service}
                onChange={(e) => setForm({ ...form, service: e.target.value })}
                placeholder={services[0]?.name ?? 'Service'}
              />
              <datalist id="service-options">
                {services.map((service) => (
                  <option key={service.id} value={service.name} />
                ))}
              </datalist>
            </div>
            <div>
              <span className={labelClass}>With (optional)</span>
              <input className={inputClass} value={form.staff} onChange={(e) => setForm({ ...form, staff: e.target.value })} placeholder={terms.staff} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={labelClass}>Time</span>
                <input type="time" className={inputClass} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              </div>
              <div>
                <span className={labelClass}>Minutes</span>
                <input type="number" min={5} max={720} className={inputClass} value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
              </div>
            </div>
            <div>
              <span className={labelClass}>Amount (optional)</span>
              <input type="number" min={0} className={inputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
              <p className="mt-1.5 text-[11px] text-stone-500">Recorded as revenue only when you mark the slot completed.</p>
            </div>
          </div>
          <div className="mt-5">
            <Button onClick={submit}>Save booking</Button>
          </div>
        </Card>
      ) : null}

      <Card className="animate-fade-up">
        <div className="mb-4 flex items-center justify-between">
          <CardTitle icon={<Clock size={17} />}>The book — {dateLong(date)}</CardTitle>
          <Badge tone="slate">{dayBook.length} slots</Badge>
        </div>

        {dayBook.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Nothing booked for this day"
            description={`Add a booking to see it here. Walk-ins can still be billed from the ${terms.desk.toLowerCase()} — the book is for appointments, not a gate.`}
          />
        ) : (
          <ul className="divide-y divide-stone-100">
            {dayBook.map((appointment) => {
              const meta = STATUS_META[appointment.status];
              return (
                <li key={appointment.id} className="flex flex-col gap-3 py-3 md:flex-row md:items-center">
                  <div className="w-16 shrink-0 font-display text-sm font-bold tabular-nums text-stone-900">{timeOf(appointment.startAt)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-stone-900">
                      <User size={13} className="text-stone-500" /> {appointment.customerName}
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-600">
                      <span>{appointment.service ?? 'Service'}</span>
                      <span>{appointment.minutes} min</span>
                      {appointment.staff ? <span>with {appointment.staff}</span> : null}
                      {appointment.phone ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone size={10} /> {appointment.phone}
                        </span>
                      ) : null}
                      {appointment.amount ? <span className="font-semibold text-stone-700">{formatCurrency(appointment.amount)}</span> : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {appointment.status === 'booked' ? (
                      <button
                        type="button"
                        onClick={() => actions.setAppointmentStatus(appointment.id, 'arrived')}
                        className="rounded-lg bg-stone-100 px-2.5 py-1.5 text-[11px] font-bold text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-200"
                      >
                        Arrived
                      </button>
                    ) : null}
                    {appointment.status !== 'done' && appointment.status !== 'cancelled' ? (
                      <button
                        type="button"
                        onClick={() => actions.setAppointmentStatus(appointment.id, 'done')}
                        className="bg-portal-gradient inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:brightness-110"
                      >
                        <CheckCircle2 size={11} /> Complete
                      </button>
                    ) : null}
                    {appointment.status !== 'cancelled' && appointment.status !== 'done' ? (
                      <button
                        type="button"
                        onClick={() => actions.setAppointmentStatus(appointment.id, 'cancelled')}
                        aria-label={`Cancel ${appointment.customerName}'s booking`}
                        className="rounded-lg bg-white p-1.5 text-stone-500 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-100 hover:text-stone-700"
                      >
                        <X size={12} />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
