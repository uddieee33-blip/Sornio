'use client';

import { MessageCircle, MessageSquare } from 'lucide-react';
import { useDukaanStore } from '@/lib/store';
import { getCustomerDueReminders } from '@/lib/reminders';
import { formatCurrency } from '@/lib/business-data';
import { useI18n } from '@/lib/i18n';

export function DueReminders() {
  const { state, hydrated } = useDukaanStore();
  const { locale } = useI18n();
  const drafts = hydrated ? getCustomerDueReminders(state) : [];
  return (
    <details id="customer-reminders" className="mt-6 rounded-2xl border border-stone-200 bg-panel p-5">
      <summary className="cursor-pointer py-1 text-lg font-bold text-stone-900">SMS & WhatsApp payment reminders</summary>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">Messages are prepared from current customer dues. Review the text, then open WhatsApp or your SMS app and send it yourself. Opening a draft does not confirm delivery. SMS charges may apply.</p>
      <p className="mt-2 text-sm text-stone-600">Automatic sending is not connected. It needs a messaging provider and approved business setup.</p>
      {drafts.length === 0 ? <p className="mt-4 text-sm text-stone-600">No payment reminders are ready. Customers need an outstanding balance and a valid phone number.</p> : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {drafts.map((draft) => (
          <article key={draft.id} className="rounded-xl border border-stone-200 p-4">
            <h3 className="font-semibold text-stone-900">{draft.customerName}</h3>
            <p className="mt-1 text-sm text-stone-600">{formatCurrency(draft.amount, locale)} · +{draft.phone}</p>
            <p className="mt-3 select-text rounded-xl bg-stone-50 p-3 text-sm leading-relaxed text-stone-700">{draft.message}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <a href={draft.whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-500/10 px-3 text-sm font-semibold text-emerald-700"><MessageCircle size={17} /> Open WhatsApp draft</a>
              <a href={draft.smsHref} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-500/10 px-3 text-sm font-semibold text-sky-700"><MessageSquare size={17} /> Open SMS draft</a>
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}
