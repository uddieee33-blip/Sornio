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
