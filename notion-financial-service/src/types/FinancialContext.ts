import { SpendingRequest, SpendingCategory } from './SpendingRequest';

export interface FinancialContext {
  recentSpending: SpendingRequest[];
  monthlyTotal: number;
  weeklyTotal: number;
  averageRequestAmount: number;
  categoryBreakdown: Record<SpendingCategory, number>;
  urgentRequestsCount: number;
  availableFunds?: number;
  monthlyBudget?: number;
}

export interface CategoryAnalysis {
  category: SpendingCategory;
  totalAmount: number;
  requestCount: number;
  averageAmount: number;
  percentageOfTotal: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface SpendingTrendAnalysis {
  period: 'daily' | 'weekly' | 'monthly';
  currentPeriodTotal: number;
  previousPeriodTotal: number;
  percentageChange: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  topCategories: CategoryAnalysis[];
}

export interface BudgetAnalysis {
  monthlyBudget: number;
  currentSpending: number;
  remainingBudget: number;
  percentageUsed: number;
  projectedMonthlySpending: number;
  onTrack: boolean;
  daysLeftInMonth: number;
  dailyBudgetRemaining: number;
}

export interface DecisionContext {
  financialHealth: {
    score: number; // 0-100
    factors: string[];
    concerns: string[];
  };
  spendingPatterns: {
    categoryRisk: Record<SpendingCategory, 'low' | 'medium' | 'high'>;
    frequencyAnalysis: {
      category: SpendingCategory;
      averageFrequency: number; // requests per week
      lastRequestDate: Date;
    }[];
    urgencyTrends: {
      emergencyRequestsThisMonth: number;
      averageEmergencyAmount: number;
    };
  };
  recommendations: {
    shouldApprove: boolean;
    confidence: number; // 0-100
    reasoning: string[];
    conditions?: string[];
    alternativeSuggestions?: string[];
  };
}

export interface ContextualSpendingRequest extends SpendingRequest {
  context: {
    categorySpendingThisMonth: number;
    categoryAverageAmount: number;
    daysSinceLastSimilarRequest: number;
    riskLevel: 'low' | 'medium' | 'high';
    budgetImpact: number; // percentage of monthly budget
    similarRequestsCount: number;
    urgencyJustified: boolean;
  };
}

// Helper functions for context analysis
export const FinancialContextHelpers = {
  calculateCategoryBreakdown: (spending: SpendingRequest[]): Record<SpendingCategory, number> => {
    const breakdown: Partial<Record<SpendingCategory, number>> = {};
    
    spending.forEach(request => {
      if (request.status === 'Approved' || request.status === 'Pending') {
        breakdown[request.category] = (breakdown[request.category] || 0) + request.amount;
      }
    });

    // Ensure all categories are present
    const categories: SpendingCategory[] = ['Food', 'Entertainment', 'Shopping', 'Bills', 'Emergency', 'Other'];
    const result = {} as Record<SpendingCategory, number>;
    
    categories.forEach(category => {
      result[category] = breakdown[category] || 0;
    });

    return result;
  },

  calculateSpendingTrend: (
    currentPeriodSpending: SpendingRequest[],
    previousPeriodSpending: SpendingRequest[]
  ): SpendingTrendAnalysis => {
    const currentTotal = currentPeriodSpending
      .filter(r => r.status === 'Approved')
      .reduce((sum, r) => sum + r.amount, 0);
    
    const previousTotal = previousPeriodSpending
      .filter(r => r.status === 'Approved')
      .reduce((sum, r) => sum + r.amount, 0);

    const percentageChange = previousTotal === 0 ? 0 : 
      ((currentTotal - previousTotal) / previousTotal) * 100;

    const getTrend = (change: number): 'increasing' | 'decreasing' | 'stable' => {
      if (Math.abs(change) < 5) return 'stable';
      return change > 0 ? 'increasing' : 'decreasing';
    };

    const categoryBreakdown = FinancialContextHelpers.calculateCategoryBreakdown(currentPeriodSpending);
    const totalCurrent = Object.values(categoryBreakdown).reduce((sum, amount) => sum + amount, 0);

    const topCategories: CategoryAnalysis[] = Object.entries(categoryBreakdown)
      .map(([category, amount]) => ({
        category: category as SpendingCategory,
        totalAmount: amount,
        requestCount: currentPeriodSpending.filter(r => r.category === category).length,
        averageAmount: amount / Math.max(1, currentPeriodSpending.filter(r => r.category === category).length),
        percentageOfTotal: totalCurrent === 0 ? 0 : (amount / totalCurrent) * 100,
        trend: 'stable' as const, // Would need historical data for accurate trend
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    return {
      period: 'monthly',
      currentPeriodTotal: currentTotal,
      previousPeriodTotal: previousTotal,
      percentageChange,
      trend: getTrend(percentageChange),
      topCategories,
    };
  },

  calculateBudgetAnalysis: (
    monthlyBudget: number,
    currentSpending: SpendingRequest[],
    daysIntoMonth: number,
    daysInMonth: number
  ): BudgetAnalysis => {
    const currentSpendingTotal = currentSpending
      .filter(r => r.status === 'Approved')
      .reduce((sum, r) => sum + r.amount, 0);

    const remainingBudget = monthlyBudget - currentSpendingTotal;
    const percentageUsed = (currentSpendingTotal / monthlyBudget) * 100;
    const daysLeftInMonth = daysInMonth - daysIntoMonth;
    const projectedMonthlySpending = (currentSpendingTotal / daysIntoMonth) * daysInMonth;
    const dailyBudgetRemaining = daysLeftInMonth > 0 ? remainingBudget / daysLeftInMonth : 0;

    return {
      monthlyBudget,
      currentSpending: currentSpendingTotal,
      remainingBudget,
      percentageUsed,
      projectedMonthlySpending,
      onTrack: projectedMonthlySpending <= monthlyBudget * 1.05, // 5% tolerance
      daysLeftInMonth,
      dailyBudgetRemaining,
    };
  },

  assessFinancialHealth: (context: FinancialContext, budgetAnalysis?: BudgetAnalysis): DecisionContext['financialHealth'] => {
    let score = 100;
    const factors: string[] = [];
    const concerns: string[] = [];

    // Budget compliance
    if (budgetAnalysis) {
      if (budgetAnalysis.percentageUsed > 90) {
        score -= 20;
        concerns.push('Monthly budget is nearly exhausted');
      } else if (budgetAnalysis.percentageUsed > 75) {
        score -= 10;
        factors.push('High budget utilization');
      } else {
        factors.push('Budget utilization under control');
      }

      if (!budgetAnalysis.onTrack) {
        score -= 15;
        concerns.push('Projected spending exceeds monthly budget');
      }
    }

    // Spending patterns
    const emergencySpending = context.categoryBreakdown.Emergency || 0;
    if (emergencySpending > context.monthlyTotal * 0.3) {
      score -= 15;
      concerns.push('High emergency spending indicates financial stress');
    }

    // Urgent requests frequency
    if (context.urgentRequestsCount > 5) {
      score -= 10;
      concerns.push('Frequent urgent requests may indicate poor planning');
    } else if (context.urgentRequestsCount === 0) {
      factors.push('No urgent requests indicates good financial planning');
    }

    // Spending distribution
    const categoryValues = Object.values(context.categoryBreakdown);
    const maxCategorySpending = Math.max(...categoryValues);
    if (maxCategorySpending > context.monthlyTotal * 0.6) {
      score -= 10;
      concerns.push('Spending heavily concentrated in one category');
    } else {
      factors.push('Spending well distributed across categories');
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      factors,
      concerns,
    };
  },

  generateDecisionRecommendation: (
    request: SpendingRequest,
    context: FinancialContext,
    budgetAnalysis?: BudgetAnalysis
  ): DecisionContext['recommendations'] => {
    const reasoning: string[] = [];
    const conditions: string[] = [];
    const alternativeSuggestions: string[] = [];
    let shouldApprove = true;
    let confidence = 80;

    // Amount analysis
    if (request.amount > context.averageRequestAmount * 2) {
      confidence -= 10;
      reasoning.push(`Request amount (${request.amount}) is significantly higher than average (${context.averageRequestAmount.toFixed(2)})`);
    }

    // Budget impact
    if (budgetAnalysis && request.amount > budgetAnalysis.remainingBudget) {
      shouldApprove = false;
      confidence += 20;
      reasoning.push('Request exceeds remaining monthly budget');
      alternativeSuggestions.push('Consider deferring to next month or reducing amount');
    }

    // Category analysis
    const categorySpending = context.categoryBreakdown[request.category] || 0;
    if (categorySpending + request.amount > context.monthlyTotal * 0.4) {
      confidence -= 15;
      reasoning.push(`High spending concentration in ${request.category} category`);
      conditions.push('Monitor category spending closely');
    }

    // Urgency assessment
    if (request.urgency === 'Critical' && request.category === 'Emergency') {
      confidence += 10;
      reasoning.push('Critical emergency request has high priority');
    } else if (request.urgency === 'Critical' && request.category !== 'Emergency') {
      confidence -= 10;
      reasoning.push('Critical urgency may not be justified for non-emergency category');
    }

    // Recent spending patterns
    if (context.weeklyTotal > context.monthlyTotal * 0.3) {
      confidence -= 10;
      reasoning.push('Recent weekly spending is high relative to monthly total');
    }

    return {
      shouldApprove,
      confidence: Math.max(0, Math.min(100, confidence)),
      reasoning,
      ...(conditions.length > 0 && { conditions }),
      ...(alternativeSuggestions.length > 0 && { alternativeSuggestions }),
    };
  },
};