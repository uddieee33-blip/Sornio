'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlarmClock, BellRing, Check, Copy, Dumbbell, MessageCircle, MessageSquare } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDukaanStore } from '@/lib/store';
import { getMembershipReminders, type MembershipReminder } from '@/lib/reminders';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ReminderCard({ reminder }: { reminder: MembershipReminder }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reminder.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable — the message is still selectable in the preview.
    }
  };

  const tone = reminder.bucket === 'expired' ? 'red' : reminder.bucket === 'today' ? 'amber' : 'sky';
  const label =
    reminder.bucket === 'expired'
      ? `Expired ${Math.abs(reminder.daysLeft)}d ago`
      : reminder.bucket === 'today'
        ? 'Ends today'
        : `${reminder.daysLeft}d left`;

  return (
    <Card className="animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-base font-bold text-stone-900">{reminder.memberName}</p>
          <p className="mt-0.5 text-xs text-stone-600">
            {reminder.planName} · expires {formatDate(reminder.expiryDate)} · {reminder.phone}
          </p>
        </div>
        <Badge tone={tone} dot>{label}</Badge>
      </div>

      <div className="mt-4 rounded-xl bg-stone-50 p-3.5 text-sm leading-relaxed text-stone-700 ring-1 ring-inset ring-stone-200">
        {reminder.message}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {reminder.channels.length === 0 ? (
          <p className="text-xs text-stone-600">
            Reminders are switched off — enable SMS/WhatsApp in{' '}
            <Link href="/settings" className="text-brand-600 hover:underline">Settings</Link>.
          </p>
        ) : (
          <>
            <button
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3.5 py-1.5 text-xs font-semibold text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-200"
            >
              {copied ? <Check size={13} className="text-emerald-700" /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy message'}
            </button>
            {reminder.whatsappHref ? (
              <a
                href={reminder.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-500/30 transition hover:bg-emerald-500/25"
              >
                <MessageCircle size={13} /> Send on WhatsApp
              </a>
            ) : null}
            {reminder.smsHref ? (
              <a
                href={reminder.smsHref}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-3.5 py-1.5 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-500/30 transition hover:bg-sky-500/25"
              >
                <MessageSquare size={13} /> Send SMS
              </a>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

export default function RemindersPage() {
  const { state } = useDukaanStore();
  const reminders = useMemo(() => getMembershipReminders(state), [state]);

  const expired = reminders.filter((r) => r.bucket === 'expired');
  const today = reminders.filter((r) => r.bucket === 'today');
  const soon = reminders.filter((r) => r.bucket === 'soon');

  if (!state.settings.allowMemberships) {
    return (
      <div className="mx-auto max-w-6xl p-4 sm:p-6 md:p-8">
        <PageHeader eyebrow="Growth" title="Reminders" subtitle="Personalized renewal nudges for your members." />
        <EmptyState
          icon={Dumbbell}
          title="Memberships are switched off"
          description="This business template does not use memberships. Enable the memberships module in Settings to start tracking renewals and reminders."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 md:p-8">
      <PageHeader
        eyebrow="Growth"
        title="Reminders"
        subtitle={`Personalized SMS & WhatsApp drafts, composed from your live membership records for ${state.profile.name}.`}
        actions={<Badge tone="brand" dot>{reminders.length} due</Badge>}
      />

      {reminders.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title="No renewals due"
          description="No memberships expire within the next 7 days. When they do, ready-to-send personalized reminders appear here."
        />
      ) : (
        <div className="space-y-8">
          {today.length > 0 ? (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-700">
                <AlarmClock size={14} /> Ending today ({today.length})
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {today.map((reminder) => <ReminderCard key={reminder.id} reminder={reminder} />)}
              </div>
            </section>
          ) : null}

          {soon.length > 0 ? (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-sky-700">
                <BellRing size={14} /> Expiring soon ({soon.length})
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {soon.map((reminder) => <ReminderCard key={reminder.id} reminder={reminder} />)}
              </div>
            </section>
          ) : null}

          {expired.length > 0 ? (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-red-700">
                <BellRing size={14} /> Expired — win them back ({expired.length})
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {expired.map((reminder) => <ReminderCard key={reminder.id} reminder={reminder} />)}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
