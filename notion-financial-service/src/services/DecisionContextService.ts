import { logger } from '../config/logger';
import { SpendingRequestService } from './SpendingRequestService';
import { FinancialDataService } from './FinancialDataService';
import {
  DecisionContext,
  SpendingRequest,
  FinancialGoal,
  DebtInfo,
  BudgetStatus,
} from '../types';
import { z } from 'zod';
import dayjs from 'dayjs';

export class DecisionContextServiceError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any,
  ) {
    super(message);
    this.name = 'DecisionContextServiceError';
  }
}

// Input validation schemas
const BuildDecisionContextSchema = z.object({
  requestId: z.string().min(1, 'Request ID is required'),
  includeComparisons: z.boolean().default(true),
  maxComparisons: z.number().int().min(1).max(20).default(5),
});

const GetRelevantComparisonsSchema = z.object({
  request: z.object({
    category: z.string(),
    amount: z.number(),
    urgency: z.string(),
  }),
  maxResults: z.number().int().min(1).max(50).default(10),
  dayRange: z.number().int().min(1).max(365).default(90),
});

export class DecisionContextService {
  private spendingService: SpendingRequestService;
  private financialService: FinancialDataService;
  private lastOperationTime?: Date;
  private errorCount = 0;
  private totalOperations = 0;

  constructor(
    spendingService: SpendingRequestService,
    financialService: FinancialDataService,
  ) {
    this.spendingService = spendingService;
    this.financialService = financialService;

    logger.info('DecisionContextService initialized');
  }

  private trackOperation(success: boolean): void {
    this.lastOperationTime = new Date();
    this.totalOperations++;
    if (!success) {
      this.errorCount++;
    }
  }

  /**
   * Build comprehensive decision context for a spending request
   */
  async buildDecisionContext(
    requestId: string,
    options: {
      includeComparisons?: boolean;
      maxComparisons?: number;
    } = {},
  ): Promise<DecisionContext> {
    try {
      // Validate input
      const validatedInput = BuildDecisionContextSchema.parse({
        requestId,
        includeComparisons: options.includeComparisons ?? true,
        maxComparisons: options.maxComparisons ?? 5,
      });

      logger.info('Building decision context');

      // Get the spending request
      const spendingContext = await this.spendingService.buildSpendingContext(30);
      const request = spendingContext.recentSpending.find(r => r.id === validatedInput.requestId);
      
      if (!request) {
        // If not in recent spending, try to get it directly (this would require a getById method)
        throw new DecisionContextServiceError(
          `Spending request ${validatedInput.requestId} not found`,
          'REQUEST_NOT_FOUND',
          { requestId: validatedInput.requestId },
        );
      }

      // Fetch all contextual data in parallel
      const [
        budgetStatus,
        activeGoals,
        allDebts,
        recentSimilar,
      ] = await Promise.all([
        this.financialService.getMonthlyBudgetStatus().catch(_error => {
          logger.warn('Failed to get budget status for decision context');
          return this.createDefaultBudgetStatus();
        }),
        this.financialService.getActiveGoals().catch(_error => {
          logger.warn('Failed to get active goals for decision context');
          return [];
        }),
        this.financialService.getAllDebts().catch(_error => {
          logger.warn('Failed to get debts for decision context');
          return [];
        }),
        validatedInput.includeComparisons 
          ? this.getRelevantComparisons(request, { maxResults: validatedInput.maxComparisons })
          : Promise.resolve([]),
      ]);

      // Analyze spending patterns
      const categorySpending = spendingContext.categoryBreakdown[request.category] || 0;
      const categoryRequests = spendingContext.recentSpending.filter(r => r.category === request.category);
      const averageCategoryAmount = categoryRequests.length > 0
        ? categoryRequests.reduce((sum, r) => sum + r.amount, 0) / categoryRequests.length
        : 0;

      // Determine category trend
      const monthAgoSpending = await this.getCategorySpendingForPeriod(
        request.category,
        dayjs().subtract(2, 'months').toDate(),
        dayjs().subtract(1, 'months').toDate(),
      );
      
      let categoryTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      if (categorySpending > monthAgoSpending * 1.1) {
        categoryTrend = 'increasing';
      } else if (categorySpending < monthAgoSpending * 0.9) {
        categoryTrend = 'decreasing';
      }

      // Analyze financial goals impact
      const conflictingGoals = activeGoals.filter(goal => 
        this.doesRequestConflictWithGoal(request, goal)
      );
      
      const impactedGoals = activeGoals.filter(goal => 
        this.doesRequestImpactGoal(request, goal, budgetStatus)
      );

      // Analyze debt situation
      const highPriorityDebts = allDebts.filter(debt => 
        ['high', 'urgent'].includes(debt.priority)
      );
      
      const totalDebt = allDebts.reduce((sum, debt) => sum + debt.remainingAmount, 0);
      const monthlyDebtPayments = allDebts.reduce((sum, debt) => sum + debt.minimumPayment, 0);

      // Calculate financial health score
      const financialHealth = this.calculateFinancialHealthScore(
        budgetStatus,
        activeGoals,
        allDebts,
        spendingContext,
      );

      // Generate recommendation
      const recommendation = this.generateRecommendation(
        request,
        budgetStatus,
        financialHealth,
        conflictingGoals,
        highPriorityDebts,
      );

      const context: DecisionContext = {
        request,
        financialHealth,
        budgetContext: budgetStatus,
        spendingPatterns: {
          recentSimilar,
          categoryTrend,
          categorySpendingThisMonth: categorySpending,
          averageCategoryAmount,
        },
        financialGoals: {
          activeGoals,
          conflictingGoals,
          impactedGoals,
        },
        debtSituation: {
          totalDebt,
          monthlyDebtPayments,
          highPriorityDebts,
        },
        recommendation,
      };

      logger.info('Successfully built decision context');

      this.trackOperation(true);
      return context;

    } catch (error) {
      this.trackOperation(false);
      
      if (error instanceof z.ZodError) {
        logger.error('Invalid input for buildDecisionContext');
        throw new DecisionContextServiceError(
          'Invalid input parameters',
          'VALIDATION_ERROR',
          { validationErrors: error.issues },
        );
      }

      if (error instanceof DecisionContextServiceError) {
        throw error;
      }

      logger.error('Failed to build decision context');
      
      throw new DecisionContextServiceError(
        'Failed to build decision context',
        'BUILD_CONTEXT_ERROR',
        { requestId, originalError: error },
      );
    }
  }

  /**
   * Find similar past requests for comparison
   */
  async getRelevantComparisons(
    request: SpendingRequest,
    options: {
      maxResults?: number;
      dayRange?: number;
    } = {},
  ): Promise<SpendingRequest[]> {
    try {
      // Validate input
      const validatedOptions = GetRelevantComparisonsSchema.parse({
        request: {
          category: request.category,
          amount: request.amount,
          urgency: request.urgency,
        },
        maxResults: options.maxResults ?? 10,
        dayRange: options.dayRange ?? 90,
      });

      logger.info('Finding relevant spending comparisons');

      // Get recent spending in the same category
      const recentSpending = await this.spendingService.getRecentSpending(validatedOptions.dayRange);
      
      // Filter and score similarity
      const comparisons = recentSpending
        .filter(r => 
          r.id !== request.id && // Exclude the current request
          r.category === request.category && // Same category
          r.status !== 'Pending' // Only decided requests
        )
        .map(r => ({
          request: r,
          similarity: this.calculateSimilarityScore(request, r),
        }))
        .filter(item => item.similarity > 0.3) // Minimum similarity threshold
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, validatedOptions.maxResults)
        .map(item => item.request);

      logger.info('Found relevant comparisons');

      this.trackOperation(true);
      return comparisons;

    } catch (error) {
      this.trackOperation(false);
      
      if (error instanceof z.ZodError) {
        logger.error('Invalid input for getRelevantComparisons');
        throw new DecisionContextServiceError(
          'Invalid input parameters',
          'VALIDATION_ERROR',
          { validationErrors: error.issues },
        );
      }

      logger.error('Failed to get relevant comparisons');
      
      throw new DecisionContextServiceError(
        'Failed to get relevant comparisons',
        'GET_COMPARISONS_ERROR',
        { originalError: error },
      );
    }
  }

  private calculateSimilarityScore(request1: SpendingRequest, request2: SpendingRequest): number {
    let score = 0;

    // Category match (required)
    if (request1.category === request2.category) {
      score += 0.4;
    } else {
      return 0; // No similarity if different categories
    }

    // Amount similarity (within 50% range gets points)
    const amountDiff = Math.abs(request1.amount - request2.amount);
    const averageAmount = (request1.amount + request2.amount) / 2;
    const amountSimilarity = Math.max(0, 1 - (amountDiff / averageAmount));
    score += amountSimilarity * 0.3;

    // Urgency similarity
    const urgencyMap = { 'Low': 1, 'Medium': 2, 'High': 3, 'Critical': 4 };
    const urgency1 = urgencyMap[request1.urgency as keyof typeof urgencyMap] || 2;
    const urgency2 = urgencyMap[request2.urgency as keyof typeof urgencyMap] || 2;
    const urgencyDiff = Math.abs(urgency1 - urgency2);
    const urgencySimilarity = Math.max(0, 1 - urgencyDiff / 3);
    score += urgencySimilarity * 0.2;

    // Time proximity (more recent = more relevant)
    const daysDiff = Math.abs(dayjs(request1.requestDate).diff(dayjs(request2.requestDate), 'days'));
    const timeSimilarity = Math.max(0, 1 - daysDiff / 90); // 90 days = 0 similarity
    score += timeSimilarity * 0.1;

    return Math.min(score, 1);
  }

  private async getCategorySpendingForPeriod(
    category: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    try {
      const patterns = await this.spendingService.getSpendingByCategory(startDate, endDate);
      const categoryPattern = patterns.find(p => p.category === category);
      return categoryPattern?.totalAmount || 0;
    } catch (error) {
      logger.warn('Failed to get category spending for period');
      return 0;
    }
  }

  private doesRequestConflictWithGoal(request: SpendingRequest, goal: FinancialGoal): boolean {
    // A request conflicts with a goal if:
    // 1. It's in a category that directly opposes the goal (e.g., entertainment vs savings goal)
    // 2. It's a large discretionary expense when trying to reach a financial goal
    
    if (goal.category === 'emergency_fund' && request.category === 'Entertainment' && request.amount > 100) {
      return true;
    }
    
    if (goal.category === 'debt_payoff' && ['Entertainment', 'Shopping'].includes(request.category) && request.amount > 200) {
      return true;
    }

    return false;
  }

  private doesRequestImpactGoal(request: SpendingRequest, goal: FinancialGoal, budget: BudgetStatus): boolean {
    // A request impacts a goal if approving it would reduce available funds for goal progress
    const remainingAfterRequest = budget.remainingBudget - request.amount;
    const goalMonthlyTarget = goal.targetAmount / 12; // Simplified monthly target

    return remainingAfterRequest < goalMonthlyTarget;
  }

  private calculateFinancialHealthScore(
    budget: BudgetStatus,
    goals: FinancialGoal[],
    debts: DebtInfo[],
    _spendingContext: any,
  ): { score: number; factors: string[]; concerns: string[] } {
    let score = 100;
    const factors: string[] = [];
    const concerns: string[] = [];

    // Budget health
    if (budget.percentageUsed < 50) {
      factors.push('Budget well under control');
    } else if (budget.percentageUsed < 75) {
      factors.push('Budget tracking is healthy');
    } else if (budget.percentageUsed < 90) {
      score -= 15;
      concerns.push('High budget utilization');
    } else {
      score -= 30;
      concerns.push('Budget nearly exhausted');
    }

    // Debt situation
    const totalDebt = debts.reduce((sum, debt) => sum + debt.remainingAmount, 0);
    const monthlyPayments = debts.reduce((sum, debt) => sum + debt.minimumPayment, 0);
    
    if (totalDebt === 0) {
      factors.push('Debt-free financial position');
    } else if (monthlyPayments > budget.monthlyBudget * 0.3) {
      score -= 20;
      concerns.push('High debt-to-income ratio');
    }

    // Goals progress
    const activeGoalsCount = goals.filter(g => g.status === 'active').length;
    if (activeGoalsCount > 0) {
      factors.push(`Actively working on ${activeGoalsCount} financial goals`);
    } else {
      score -= 10;
      concerns.push('No active financial goals set');
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      factors,
      concerns,
    };
  }

  private generateRecommendation(
    request: SpendingRequest,
    budget: BudgetStatus,
    financialHealth: { score: number; factors: string[]; concerns: string[] },
    conflictingGoals: FinancialGoal[],
    highPriorityDebts: DebtInfo[],
  ): { shouldApprove: boolean; confidence: number; reasoning: string[]; conditions?: string[]; alternatives?: string[] } {
    const reasoning: string[] = [];
    const conditions: string[] = [];
    const alternatives: string[] = [];
    let shouldApprove = true;
    let confidence = 80;

    // Budget impact analysis
    if (request.amount > budget.remainingBudget) {
      shouldApprove = false;
      confidence = 90;
      reasoning.push(`Request amount ($${request.amount}) exceeds remaining budget ($${budget.remainingBudget})`);
      alternatives.push('Consider deferring to next month or reducing amount');
    } else if (request.amount > budget.remainingBudget * 0.5) {
      confidence -= 15;
      reasoning.push('Request uses significant portion of remaining budget');
      conditions.push('Monitor remaining budget carefully after approval');
    }

    // Urgency consideration
    if (request.urgency === 'Critical' || request.urgency === 'High') {
      if (request.category === 'Emergency') {
        confidence += 10;
        reasoning.push('High urgency emergency request has priority');
      } else {
        reasoning.push(`High urgency for ${request.category} category - verify necessity`);
      }
    }

    // Financial health impact
    if (financialHealth.score < 50) {
      confidence -= 20;
      reasoning.push('Current financial health score is concerning');
    } else if (financialHealth.score > 80) {
      confidence += 10;
      reasoning.push('Strong financial health supports discretionary spending');
    }

    // Goal conflicts
    if (conflictingGoals.length > 0) {
      confidence -= 15;
      reasoning.push(`Request may conflict with ${conflictingGoals.length} active financial goals`);
      conditions.push('Consider impact on financial goals before approval');
    }

    // High priority debts
    if (highPriorityDebts.length > 0 && !['Emergency', 'Bills'].includes(request.category)) {
      confidence -= 10;
      reasoning.push('High priority debts exist - prioritize debt payments');
    }

    // Category-specific logic
    if (request.category === 'Entertainment' && request.amount > 200) {
      confidence -= 10;
      reasoning.push('Large entertainment expense requires justification');
      conditions.push('Ensure this is a planned expense, not impulse purchase');
    }

    return {
      shouldApprove,
      confidence: Math.max(0, Math.min(100, confidence)),
      reasoning,
      ...(conditions.length > 0 && { conditions }),
      ...(alternatives.length > 0 && { alternatives }),
    };
  }

  private createDefaultBudgetStatus(): BudgetStatus {
    return {
      monthlyBudget: 3000,
      currentSpending: 0,
      remainingBudget: 3000,
      percentageUsed: 0,
      daysIntoMonth: dayjs().date(),
      daysRemainingInMonth: dayjs().endOf('month').date() - dayjs().date(),
      dailyAverageSpent: 0,
      projectedMonthlySpending: 0,
      isOnTrack: true,
      budgetHealth: 'excellent',
      recommendations: ['Default budget status - configure actual budget tracking'],
    };
  }

  /**
   * Get service health and performance metrics
   */
  getServiceMetrics(): {
    lastOperationTime?: Date;
    errorRate: number;
    totalOperations: number;
  } {
    const errorRate = this.totalOperations > 0 ? (this.errorCount / this.totalOperations) * 100 : 0;

    return {
      ...(this.lastOperationTime && { lastOperationTime: this.lastOperationTime }),
      errorRate,
      totalOperations: this.totalOperations,
    };
  }
}