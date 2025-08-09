// Export individual type files
export * from './SpendingRequest';
export * from './FinancialGoal';
export * from './DebtInfo';
export * from './AccountBalance';
export * from './NotionProperty';
export * from './FinancialContext';

// Import types for interface definitions
import type { SpendingRequest } from './SpendingRequest';
import type { FinancialGoal } from './FinancialGoal';
import type { DebtInfo } from './DebtInfo';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination?: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export interface ErrorResponse {
  success: false;
  error: string;
  details?: Record<string, any>;
  timestamp: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    notion: 'connected' | 'disconnected' | 'error';
    database: 'connected' | 'disconnected' | 'error';
  };
}

export interface BudgetStatus {
  monthlyBudget: number;
  currentSpending: number;
  remainingBudget: number;
  percentageUsed: number;
  daysIntoMonth: number;
  daysRemainingInMonth: number;
  dailyAverageSpent: number;
  projectedMonthlySpending: number;
  isOnTrack: boolean;
  budgetHealth: 'excellent' | 'good' | 'warning' | 'critical';
  recommendations: string[];
}

export interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    notionClient: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      metrics: any;
      lastCheck: Date;
    };
    spendingService: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      lastOperation?: Date;
      errorRate?: number;
    };
    financialDataService: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      lastOperation?: Date;
      errorRate?: number;
    };
  };
  timestamp: Date;
  uptime: number;
}

export interface DecisionContext {
  request: SpendingRequest;
  financialHealth: {
    score: number; // 0-100
    factors: string[];
    concerns: string[];
  };
  budgetContext: BudgetStatus;
  spendingPatterns: {
    recentSimilar: SpendingRequest[];
    categoryTrend: 'increasing' | 'decreasing' | 'stable';
    categorySpendingThisMonth: number;
    averageCategoryAmount: number;
  };
  financialGoals: {
    activeGoals: FinancialGoal[];
    conflictingGoals: FinancialGoal[];
    impactedGoals: FinancialGoal[];
  };
  debtSituation: {
    totalDebt: number;
    monthlyDebtPayments: number;
    highPriorityDebts: DebtInfo[];
  };
  recommendation: {
    shouldApprove: boolean;
    confidence: number; // 0-100
    reasoning: string[];
    conditions?: string[];
    alternatives?: string[];
  };
}