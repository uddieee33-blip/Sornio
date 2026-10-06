import { moduleLabels, PORTALS } from '@/lib/portals/registry';
import type { PortalId } from '@/lib/portals/types';

export type Business = {
  id: string;
  name: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail?: string;
  businessType: string;
  description: string;
  currency: string;
  timezone: string;
  upiId?: string;
  bankName?: string;
  ifscCode?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BusinessSettings = {
  id: string;
  businessId: string;
  receiptMode: 'digital' | 'physical' | 'both';
  sendSmsReminders: boolean;
  sendWhatsappReminders: boolean;
  autoGenerateInvoiceNumber: boolean;
  taxRate: number;
  allowMemberships: boolean;
  allowInventory: boolean;
  allowAppointments: boolean;
  allowDigitalReceipts: boolean;
  allowPhysicalReceipts: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BusinessTemplate = {
  id: string;
  name: string;
  category: 'retail' | 'service' | 'fitness' | 'hospitality' | 'electronics' | 'fashion' | 'general';
  description: string;
  recommendedModules: string[];
  /** The portal this template activates (see lib/portals). */
  portalId: PortalId;
  /** What the owner gets, in their words. */
  promise: string;
  /** What we deliberately left out, and why. */
  excluded: string;
};

export type BusinessSnapshot = {
  businessId: string;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  cashBalance: number;
  bankBalance: number;
  upiBalance: number;
  inventoryValue: number;
  activeMembers: number;
  pendingPayments: number;
  lastUpdated: string;
};

export type BusinessMetrics = {
  dailyRevenue: number;
  weeklyRevenue: number;
  monthlyRevenue: number;
  totalCustomers: number;
  repeatCustomers: number;
  customerRetentionRate: number;
  averageOrderValue: number;
  topProduct: string;
  topProductRevenue: number;
};

export type AuditEvent = {
  id: string;
  businessId: string;
  type: 'invoice' | 'payment' | 'inventory' | 'member' | 'security' | 'system';
  actor: string;
  summary: string;
  createdAt: string;
};

/**
 * Onboarding templates.
 *
 * Derived from the portal blueprints rather than written by hand: the card an
 * owner taps during onboarding and the console they land in are generated from
 * the same definition, so a template can never promise one thing and deliver
 * another.
 */
export const businessTemplates: BusinessTemplate[] = PORTALS.map((portal) => ({
  id: portal.templateId,
  name: portal.name,
  category: portal.category,
  description: portal.promise,
  recommendedModules: moduleLabels(portal.id),
  portalId: portal.id,
  promise: portal.promise,
  excluded: portal.excluded,
}));

/** Templates that ship with the product (kept for exports and validation). */
export const TEMPLATE_IDS: string[] = businessTemplates.map((template) => template.id);

export const demoBusiness: Business = {
  id: 'biz-1',
  name: 'Cult Fitness',
  ownerName: 'Rohit Kapoor',
  ownerPhone: '+91 98100 12345',
  ownerEmail: 'rohit@cultfitness.in',
  businessType: 'fitness',
  description: 'Neighborhood gym with membership plans, personal training, and renewal automation.',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  upiId: 'cultfitness@upi',
  bankName: 'HDFC Bank',
  ifscCode: 'HDFC0001234',
  isActive: true,
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-10-02T09:00:00.000Z',
};

export const defaultBusinessSettings: BusinessSettings = {
  id: 'settings-1',
  businessId: 'biz-1',
  receiptMode: 'both',
  sendSmsReminders: true,
  sendWhatsappReminders: true,
  autoGenerateInvoiceNumber: true,
  taxRate: 18,
  allowMemberships: true,
  allowInventory: true,
  allowAppointments: false,
  allowDigitalReceipts: true,
  allowPhysicalReceipts: true,
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-10-02T09:00:00.000Z',
};

export const sampleAuditEvents: AuditEvent[] = [
  {
    id: 'audit-1',
    businessId: 'biz-1',
    type: 'invoice',
    actor: 'Rohit Kapoor',
    summary: 'Invoice INV-1001 issued to John Wilson for ₹4,999.',
    createdAt: '2026-10-02T10:05:00.000Z',
  },
  {
    id: 'audit-2',
    businessId: 'biz-1',
    type: 'payment',
    actor: 'System',
    summary: 'UPI payment of ₹4,999 marked as paid against INV-1001.',
    createdAt: '2026-10-02T10:06:00.000Z',
  },
  {
    id: 'audit-3',
    businessId: 'biz-1',
    type: 'member',
    actor: 'Front Desk',
    summary: 'Member Priya Nair subscribed to Annual Elite (12 months).',
    createdAt: '2026-10-01T17:30:00.000Z',
  },
  {
    id: 'audit-4',
    businessId: 'biz-1',
    type: 'inventory',
    actor: 'Rohit Kapoor',
    summary: 'Stock adjustment recorded for 12 protein packs.',
    createdAt: '2026-09-30T11:15:00.000Z',
  },
  {
    id: 'audit-5',
    businessId: 'biz-1',
    type: 'security',
    actor: 'System',
    summary: 'Reminder templates updated for 3-day expiry notices.',
    createdAt: '2026-09-28T09:45:00.000Z',
  },
];

/**
 * Map a financial-engine snapshot plus live module counts into the
 * universal BusinessSnapshot shape consumed by the AI insights engine.
 */
export function toBusinessSnapshot(
  financial: {
    revenue: number;
    cogs: number;
    operatingExpenses: number;
    netProfit: number;
    cashBalance: number;
    bankBalance: number;
    upiBalance: number;
    inventoryValue: number;
  },
  extras: { businessId?: string; activeMembers?: number; pendingPayments?: number } = {},
): BusinessSnapshot {
  return {
    businessId: extras.businessId ?? 'biz-1',
    totalRevenue: financial.revenue,
    totalExpenses: financial.cogs + financial.operatingExpenses,
    netProfit: financial.netProfit,
    cashBalance: financial.cashBalance,
    bankBalance: financial.bankBalance,
    upiBalance: financial.upiBalance,
    inventoryValue: financial.inventoryValue,
    activeMembers: extras.activeMembers ?? 0,
    pendingPayments: extras.pendingPayments ?? 0,
    lastUpdated: new Date().toISOString(),
  };
}
