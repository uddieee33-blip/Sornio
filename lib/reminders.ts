/**
 * Membership reminder engine.
 *
 * Derives personalized, ready-to-send SMS / WhatsApp reminders from the live
 * subscription ledger — never from hardcoded data. Messages are composed from
 * the member's name, the plan, and the business's own name, exactly as an
 * owner would send them. Delivery stays in the owner's hands (deep links);
 * the app never touches messaging credentials.
 */
import { daysUntil } from '@/lib/models/membership';
import type { StoreState } from '@/lib/store';
import { customerBalance } from '@/lib/accounting';

export type ReminderChannel = 'sms' | 'whatsapp';

export type MembershipReminder = {
  id: string;
  memberId: string;
  memberName: string;
  phone: string;
  planName: string;
  expiryDate: string;
  /** Whole days until expiry — negative if already expired. */
  daysLeft: number;
  bucket: 'expired' | 'today' | 'soon';
  message: string;
  channels: ReminderChannel[];
  whatsappHref?: string;
  smsHref?: string;
};

/** Keep expired items visible for follow-up, but not forever. */
const EXPIRED_FOLLOWUP_DAYS = 30;
const UPCOMING_WINDOW_DAYS = 7;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Normalize an Indian phone number to the international format deep links need. */
export function normalizePhoneForLink(phone: string): string {
  if (!/^\+?[\d\s().-]+$/.test(phone.trim())) return '';
  const digits = digitsOnly(phone).replace(/^00/, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (/^91\d{10}$/.test(digits) && !/^91[6-9]/.test(digits)) return '';
  return /^[1-9]\d{7,14}$/.test(digits) && (phone.trim().startsWith('+') || digits.length > 10) ? digits : '';
}

export type CustomerDueReminder = {
  id: string;
  customerName: string;
  phone: string;
  amount: number;
  message: string;
  whatsappHref: string;
  smsHref: string;
};

/** Prepare from the current ledger; opening a link never means "delivered". */
export function getCustomerDueReminders(state: Pick<StoreState, 'profile' | 'customers' | 'transactions'>): CustomerDueReminder[] {
  const businessName = state.profile.name.trim() || 'our business';
  return state.customers.flatMap((customer) => {
    const phone = normalizePhoneForLink(customer.phone ?? '');
    const amount = customerBalance(customer, state.transactions);
    if (!phone || !Number.isFinite(amount) || amount <= 0) return [];
    const firstName = customer.name.trim().split(/\s+/)[0] || 'customer';
    const message = `Hi ${firstName}, your outstanding balance at ${businessName} is INR ${amount.toFixed(2)}. Please contact us to arrange payment. Thank you.`;
    const encoded = encodeURIComponent(message);
    return [{ id: customer.id, customerName: customer.name, phone, amount, message, whatsappHref: `https://wa.me/${phone}?text=${encoded}`, smsHref: `sms:+${phone}?body=${encoded}` }];
  }).sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
}

export function buildReminderMessage(input: {
  firstName: string;
  businessName: string;
  planName: string;
  daysLeft: number;
}): string {
  const { firstName, businessName, planName, daysLeft } = input;
  if (daysLeft < 0) {
    const ago = Math.abs(daysLeft);
    return `Hi ${firstName}, your ${planName} membership at ${businessName} expired ${ago} day${ago === 1 ? '' : 's'} ago. Renew today and pick up right where you left off — we miss having you!`;
  }
  if (daysLeft === 0) {
    return `Hi ${firstName}, your ${planName} membership at ${businessName} ends today. Renew now to continue without any break.`;
  }
  return `Hi ${firstName}, your ${planName} membership at ${businessName} ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Renew now to keep your streak going!`;
}

/** Compute every membership reminder due, from live subscriptions. */
export function getMembershipReminders(state: StoreState, reference: Date = new Date()): MembershipReminder[] {
  const { subscriptions, members, plans, settings, profile } = state;
  if (!settings.allowMemberships) return [];

  const businessName = profile.name.trim() || 'our business';

  return subscriptions
    .filter((subscription) => subscription.status !== 'paused')
    .map((subscription): MembershipReminder | null => {
      const member = members.find((m) => m.id === subscription.memberId);
      const plan = plans.find((p) => p.id === subscription.planId);
      if (!member || !plan || !member.phone.trim()) return null;

      const daysLeft = daysUntil(subscription.expiryDate, reference);
      if (daysLeft > UPCOMING_WINDOW_DAYS || daysLeft < -EXPIRED_FOLLOWUP_DAYS) return null;

      const bucket: MembershipReminder['bucket'] = daysLeft < 0 ? 'expired' : daysLeft === 0 ? 'today' : 'soon';
      const firstName = member.name.trim().split(/\s+/)[0] || member.name.trim();
      const message = buildReminderMessage({ firstName, businessName, planName: plan.name, daysLeft });

      // Honor both the member's channel preference and the business settings.
      const channels: ReminderChannel[] = [];
      if (settings.sendSmsReminders && member.preferredChannel !== 'whatsapp') channels.push('sms');
      if (settings.sendWhatsappReminders && member.preferredChannel !== 'sms') channels.push('whatsapp');

      const linkPhone = normalizePhoneForLink(member.phone);
      if (!linkPhone) return null;
      const encoded = encodeURIComponent(message);

      return {
        id: `reminder-${subscription.id}`,
        memberId: member.id,
        memberName: member.name,
        phone: member.phone,
        planName: plan.name,
        expiryDate: subscription.expiryDate,
        daysLeft,
        bucket,
        message,
        channels,
        whatsappHref: channels.includes('whatsapp') ? `https://wa.me/${linkPhone}?text=${encoded}` : undefined,
        smsHref: channels.includes('sms') ? `sms:+${linkPhone}?body=${encoded}` : undefined,
      };
    })
    .filter((reminder): reminder is MembershipReminder => reminder !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
