import { getActiveFormattingLocale } from '../locale';

import type { Invoice } from '@/lib/models/billing';
import type { MembershipSubscription } from '@/lib/models/membership';
import type { BusinessSnapshot } from '@/lib/models/business';
import type { AiTip, BusinessHealth, Insight } from '@/lib/models/insights';

export class AiInsightsEngine {
  static calculateBusinessHealth(
    snapshot: BusinessSnapshot,
    invoices: Invoice[],
    subscriptions: MembershipSubscription[],
  ): BusinessHealth {
    const totalRevenue = snapshot.totalRevenue;
    const netProfit = snapshot.netProfit;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    const revenueHealth = Math.min((totalRevenue / 100000) * 25, 25);
    const profitabilityHealth = Math.max(0, Math.min(25, (Math.max(0, profitMargin - 10) / 20) * 25));
    const cashFlowHealth = snapshot.cashBalance > 0 ? Math.min(20, (snapshot.cashBalance / 50000) * 20) : 0;

    const paidInvoices = invoices.filter((invoice) => invoice.paymentStatus === 'paid').length;
    const customerHealth = invoices.length > 0 ? Math.min(15, (paidInvoices / invoices.length) * 15) : 0;

    const activeMembers = subscriptions.filter((subscription) => subscription.status === 'active').length;
    const membershipHealth = Math.min(15, (activeMembers / 10) * 15);

    const overallScore = Math.round(
      revenueHealth + profitabilityHealth + cashFlowHealth + customerHealth + membershipHealth,
    );

    return {
      businessId: snapshot.businessId,
      overallScore,
      revenueHealth: Math.round(revenueHealth),
      profitabilityHealth: Math.round(profitabilityHealth),
      cashFlowHealth: Math.round(cashFlowHealth),
      customerHealth: Math.round(customerHealth),
      inventoryHealth: 0,
      membershipHealth: Math.round(membershipHealth),
      growthTrend: profitMargin > 15 ? 'up' : profitMargin < 5 ? 'down' : 'stable',
      lastUpdated: new Date().toISOString(),
    };
  }

  static generateInsights(
    snapshot: BusinessSnapshot,
    invoices: Invoice[],
    subscriptions: MembershipSubscription[],
  ): Insight[] {
    const today = new Date();
    const insights: Insight[] = [];

    if (snapshot.totalRevenue > 0) {
      insights.push({
        id: 'revenue-trend',
        businessId: snapshot.businessId,
        type: 'trend',
        title: 'Revenue Performance',
        description: `Your weekly revenue is ₹${snapshot.totalRevenue.toLocaleString(getActiveFormattingLocale())}. Strong momentum is visible.`,
        metric: snapshot.totalRevenue,
        metricLabel: 'Weekly Revenue',
        actionable: false,
        priority: 'medium',
        createdAt: today.toISOString(),
      });
    }

    const expiringMembers = subscriptions.filter((subscription) => {
      const diff = new Date(subscription.expiryDate).getTime() - today.getTime();
      const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
      return daysLeft > 0 && daysLeft <= 7;
    });

    if (expiringMembers.length > 0) {
      insights.push({
        id: 'members-expiring',
        businessId: snapshot.businessId,
        type: 'opportunity',
        title: 'Members expiring soon',
        description: `${expiringMembers.length} member(s) need renewal attention this week.`,
        metric: expiringMembers.length,
        metricLabel: 'Members expiring',
        actionable: true,
        action: 'Send reminder SMS or WhatsApp messages',
        priority: 'high',
        createdAt: today.toISOString(),
      });
    }

    const pendingInvoices = invoices.filter((invoice) => invoice.paymentStatus === 'pending');
    const pendingAmount = pendingInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);

    if (pendingAmount > 0) {
      insights.push({
        id: 'pending-payments',
        businessId: snapshot.businessId,
        type: 'warning',
        title: 'Outstanding payments',
        description: `₹${pendingAmount.toLocaleString(getActiveFormattingLocale())} is still pending across ${pendingInvoices.length} invoice(s).`,
        metric: pendingAmount,
        metricLabel: 'Pending Amount',
        actionable: true,
        action: 'Send payment reminders',
        priority: 'high',
        createdAt: today.toISOString(),
      });
    }

    const profitMargin = snapshot.totalRevenue > 0 ? ((snapshot.netProfit / snapshot.totalRevenue) * 100) : 0;
    if (profitMargin < 10) {
      insights.push({
        id: 'low-margin',
        businessId: snapshot.businessId,
        type: 'warning',
        title: 'Low profit margin',
        description: `Profit margin is ${profitMargin.toFixed(1)}%. Review pricing and operating costs.`,
        metric: profitMargin,
        metricLabel: 'Profit Margin %',
        actionable: true,
        action: 'Cut costs or improve pricing',
        priority: 'high',
        createdAt: today.toISOString(),
      });
    }

    return insights;
  }

  static generateTips(
    snapshot: BusinessSnapshot,
    invoices: Invoice[],
    subscriptions: MembershipSubscription[],
  ): AiTip[] {
    const tips: AiTip[] = [];

    if (subscriptions.length < 10) {
      tips.push({
        id: 'tip-membership-growth',
        businessId: snapshot.businessId,
        category: 'membership',
        title: 'Grow your membership base',
        description: 'You have fewer than 10 active members. This is a clear opportunity for predictable monthly revenue.',
        implementation: 'Offer a discounted yearly plan and send special renewal reminders to users with 1-3 day expiry windows.',
        expectedImpact: 'More stable recurring revenue and stronger customer retention.',
        difficulty: 'easy',
        estimatedTime: '1 week',
        createdAt: new Date().toISOString(),
      });
    }

    if ((invoices.filter((invoice) => invoice.receiptMode === 'digital' || invoice.receiptMode === 'both').length / Math.max(invoices.length, 1)) < 0.5) {
      tips.push({
        id: 'tip-digital-receipts',
        businessId: snapshot.businessId,
        category: 'revenue',
        title: 'Use digital receipts more often',
        description: 'Digital receipts improve customer experience and help you build better customer data.',
        implementation: 'Ask for phone numbers at checkout and send receipts via SMS or WhatsApp automatically.',
        expectedImpact: 'Higher repeat customers and easier follow-up marketing.',
        difficulty: 'easy',
        estimatedTime: '30 minutes',
        createdAt: new Date().toISOString(),
      });
    }

    const expiredMembers = subscriptions.filter((subscription) => subscription.status === 'expired').length;
    if (expiredMembers > 0) {
      tips.push({
        id: 'tip-churn',
        businessId: snapshot.businessId,
        category: 'customers',
        title: 'Reduce member churn',
        description: `${expiredMembers} member(s) have already expired. Re-engagement is critical.`,
        implementation: 'Send a friendly “come back” message with a discounted renewal or bonus benefit.',
        expectedImpact: 'Recover lost revenue and keep your customer base strong.',
        difficulty: 'medium',
        estimatedTime: '2-3 days',
        createdAt: new Date().toISOString(),
      });
    }

    return tips;
  }
}
