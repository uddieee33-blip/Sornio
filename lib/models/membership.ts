export type MembershipPlanType = 'monthly' | 'quarterly' | 'half_yearly' | 'annual';

export type MembershipPlan = {
  id: string;
  businessId: string;
  name: string;
  type: MembershipPlanType;
  durationMonths: number;
  price: number;
  description?: string;
  isActive: boolean;
};

export type Member = {
  id: string;
  businessId: string;
  name: string;
  phone: string;
  email?: string;
  preferredChannel: 'sms' | 'whatsapp' | 'both';
  createdAt: string;
};

export type MembershipSubscription = {
  id: string;
  businessId: string;
  memberId: string;
  planId: string;
  startDate: string;
  expiryDate: string;
  autoRenew: boolean;
  status: 'active' | 'expiring_soon' | 'expired' | 'paused';
  reminderSentAt?: string;
  createdAt: string;
};

export type ReminderTemplate = {
  id: string;
  businessId: string;
  name: string;
  channel: 'sms' | 'whatsapp' | 'both';
  message: string;
  daysBeforeExpiry: number;
  isActive: boolean;
};

export const defaultMembershipPlans: MembershipPlan[] = [
  {
    id: 'plan-monthly',
    businessId: 'default',
    name: 'Monthly Access',
    type: 'monthly',
    durationMonths: 1,
    price: 1999,
    description: 'Ideal for short-term commitments.',
    isActive: true,
  },
  {
    id: 'plan-quarterly',
    businessId: 'default',
    name: 'Quarterly Plus',
    type: 'quarterly',
    durationMonths: 3,
    price: 4999,
    description: 'Best for steady members.',
    isActive: true,
  },
  {
    id: 'plan-half-year',
    businessId: 'default',
    name: 'Half Year Fitness',
    type: 'half_yearly',
    durationMonths: 6,
    price: 8999,
    description: 'Great for consistent training.',
    isActive: true,
  },
  {
    id: 'plan-annual',
    businessId: 'default',
    name: 'Annual Elite',
    type: 'annual',
    durationMonths: 12,
    price: 15999,
    description: 'Best long-term value.',
    isActive: true,
  },
];

export const defaultMembers: Member[] = [
  {
    id: 'member-1',
    businessId: 'biz-1',
    name: 'John Wilson',
    phone: '+91 98765 43210',
    email: 'john.wilson@example.com',
    preferredChannel: 'both',
    createdAt: '2026-06-30T08:00:00.000Z',
  },
  {
    id: 'member-2',
    businessId: 'biz-1',
    name: 'Aisha Khan',
    phone: '+91 91234 56789',
    email: 'aisha.khan@example.com',
    preferredChannel: 'whatsapp',
    createdAt: '2026-08-01T08:00:00.000Z',
  },
  {
    id: 'member-3',
    businessId: 'biz-1',
    name: 'Rahul Mehta',
    phone: '+91 99887 66554',
    preferredChannel: 'sms',
    createdAt: '2026-05-04T08:00:00.000Z',
  },
  {
    id: 'member-4',
    businessId: 'biz-1',
    name: 'Priya Nair',
    phone: '+91 90909 80807',
    email: 'priya.nair@example.com',
    preferredChannel: 'whatsapp',
    createdAt: '2026-09-25T08:00:00.000Z',
  },
  {
    id: 'member-5',
    businessId: 'biz-1',
    name: 'Vikram Singh',
    phone: '+91 93456 12890',
    preferredChannel: 'sms',
    createdAt: '2026-07-15T08:00:00.000Z',
  },
];

export const defaultReminderTemplates: ReminderTemplate[] = [
  {
    id: 'reminder-3day',
    businessId: 'biz-1',
    name: '3 day notice',
    channel: 'both',
    message:
      'Hi {customerName}, your {businessName} membership is ending in 3 days. Renew now to stay on track and keep your momentum going.',
    daysBeforeExpiry: 3,
    isActive: true,
  },
  {
    id: 'reminder-1day',
    businessId: 'biz-1',
    name: '1 day notice',
    channel: 'whatsapp',
    message:
      'Hi {customerName}, your {businessName} membership ends tomorrow. Renew today and avoid any break in access.',
    daysBeforeExpiry: 1,
    isActive: true,
  },
  {
    id: 'reminder-expiry-day',
    businessId: 'biz-1',
    name: 'Expiry today',
    channel: 'sms',
    message:
      'Hi {customerName}, your {businessName} membership expires today. Renew now to continue your journey.',
    daysBeforeExpiry: 0,
    isActive: true,
  },
];

/** Whole days from the reference date until the given ISO date (negative if past). */
export function daysUntil(dateISO: string, reference: Date = new Date()): number {
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  return Math.round((startOfDay(new Date(dateISO)) - startOfDay(reference)) / (1000 * 60 * 60 * 24));
}

/** Derive the lifecycle status of a subscription from its expiry date. */
export function deriveSubscriptionStatus(
  expiryDate: string,
  reference: Date = new Date(),
  expiringWindowDays = 7,
): MembershipSubscription['status'] {
  const days = daysUntil(expiryDate, reference);
  if (days < 0) return 'expired';
  if (days <= expiringWindowDays) return 'expiring_soon';
  return 'active';
}

function addDays(reference: Date, days: number): string {
  const date = new Date(reference);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

/**
 * Sample subscriptions with expiry dates computed relative to a reference date
 * (defaults to today) so renewal workflows always demonstrate live scenarios.
 */
export function buildSampleSubscriptions(reference: Date = new Date()): MembershipSubscription[] {
  const rows: Array<
    Omit<MembershipSubscription, 'expiryDate' | 'status'> & { expiresInDays: number }
  > = [
    {
      id: 'sub-1',
      businessId: 'biz-1',
      memberId: 'member-1',
      planId: 'plan-quarterly',
      startDate: addDays(reference, -87),
      expiresInDays: 3,
      autoRenew: false,
      createdAt: addDays(reference, -87),
    },
    {
      id: 'sub-2',
      businessId: 'biz-1',
      memberId: 'member-2',
      planId: 'plan-monthly',
      startDate: addDays(reference, -29),
      expiresInDays: 1,
      autoRenew: true,
      createdAt: addDays(reference, -29),
    },
    {
      id: 'sub-3',
      businessId: 'biz-1',
      memberId: 'member-3',
      planId: 'plan-monthly',
      startDate: addDays(reference, -30),
      expiresInDays: 0,
      autoRenew: false,
      createdAt: addDays(reference, -30),
    },
    {
      id: 'sub-4',
      businessId: 'biz-1',
      memberId: 'member-4',
      planId: 'plan-annual',
      startDate: addDays(reference, -9),
      expiresInDays: 356,
      autoRenew: true,
      createdAt: addDays(reference, -9),
    },
    {
      id: 'sub-5',
      businessId: 'biz-1',
      memberId: 'member-5',
      planId: 'plan-half-year',
      startDate: addDays(reference, -192),
      expiresInDays: -12,
      autoRenew: false,
      createdAt: addDays(reference, -192),
    },
  ];

  return rows.map(({ expiresInDays, ...subscription }) => {
    const expiryDate = addDays(reference, expiresInDays);
    return { ...subscription, expiryDate, status: deriveSubscriptionStatus(expiryDate, reference) };
  });
}
