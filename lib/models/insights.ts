export type InsightType = 'trend' | 'warning' | 'opportunity' | 'growth';
export type Priority = 'low' | 'medium' | 'high';

export type Insight = {
  id: string;
  businessId: string;
  type: InsightType;
  title: string;
  description: string;
  metric: number;
  metricLabel: string;
  actionable: boolean;
  action?: string;
  priority: Priority;
  createdAt: string;
};

export type AiTip = {
  id: string;
  businessId: string;
  category: 'membership' | 'revenue' | 'customers' | 'inventory' | 'growth';
  title: string;
  description: string;
  implementation: string;
  expectedImpact: string;
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedTime: string;
  createdAt: string;
};

export type BusinessHealth = {
  businessId: string;
  overallScore: number;
  revenueHealth: number;
  profitabilityHealth: number;
  cashFlowHealth: number;
  customerHealth: number;
  inventoryHealth: number;
  membershipHealth: number;
  growthTrend: 'up' | 'down' | 'stable';
  lastUpdated: string;
};
