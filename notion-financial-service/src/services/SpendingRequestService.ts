import { logger } from '../config/logger';
import { NotionClient } from './NotionClient';
import { FilterBuilder, SortBuilder } from './FilterBuilder';
import {
  SpendingRequest,
  SpendingRequestDecision,
  SpendingRequestDecisionSchema,
  SpendingCategory,
  SpendingStatus,
  UrgencyLevel,
  NotionPageBase,
  FinancialContext,
  FinancialContextHelpers,
  NotionConverters,
} from '../types';
import { z } from 'zod';
import dayjs from 'dayjs';

export interface SpendingRequestServiceConfig {
  databaseId: string;
  minimumAmount?: number;
  defaultPageSize?: number;
}

export interface SpendingPattern {
  category: SpendingCategory;
  totalAmount: number;
  requestCount: number;
  averageAmount: number;
  approvalRate: number;
}

export interface SpendingTrend {
  period: string;
  totalSpending: number;
  requestCount: number;
  averageAmount: number;
  topCategories: SpendingPattern[];
}

// Input validation schemas
const GetPendingRequestsSchema = z.object({
  minimumAmount: z.number().positive().optional(),
});

const GetRecentSpendingSchema = z.object({
  days: z.number().int().min(1).max(365).default(30),
});

const UpdateDecisionSchema = z.object({
  requestId: z.string().min(1, 'Request ID is required'),
  decision: z.enum(['Approved', 'Denied']),
  reasoning: z.string().min(10, 'Reasoning must be at least 10 characters'),
});

const GetSpendingByCategorySchema = z.object({
  startDate: z.date(),
  endDate: z.date(),
}).refine(data => data.startDate <= data.endDate, {
  message: 'Start date must be before or equal to end date',
});

const BuildSpendingContextSchema = z.object({
  days: z.number().int().min(1).max(365).default(30),
});

export class SpendingRequestServiceError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any,
  ) {
    super(message);
    this.name = 'SpendingRequestServiceError';
  }
}

export class SpendingRequestService {
  private notion: NotionClient;
  private config: Required<SpendingRequestServiceConfig>;

  constructor(notionClient: NotionClient, config: SpendingRequestServiceConfig) {
    this.notion = notionClient;
    this.config = {
      minimumAmount: 50,
      defaultPageSize: 100,
      ...config,
    };

    logger.info('SpendingRequestService initialized', {
      databaseId: this.config.databaseId,
      minimumAmount: this.config.minimumAmount,
    });
  }

  private parseSpendingRequestFromPage(page: NotionPageBase): SpendingRequest | null {
    try {
      const rawData = {
        id: page.id,
        title: this.notion.extractTitle(page.properties['Title']) || 
               this.notion.extractText(page.properties['Title']),
        amount: this.notion.extractNumber(page.properties['Amount']),
        description: this.notion.extractText(page.properties['Description']),
        category: this.notion.extractSelect(page.properties['Category']) as SpendingCategory,
        status: this.notion.extractSelect(page.properties['Status']) as SpendingStatus,
        requestDate: this.notion.extractDate(page.properties['Request Date']) || 
                     new Date(page.created_time),
        decisionDate: this.notion.extractDate(page.properties['Decision Date']),
        reasoning: this.notion.extractText(page.properties['Reasoning']),
        urgency: this.notion.extractSelect(page.properties['Urgency']) as UrgencyLevel,
        tags: this.notion.extractMultiSelect(page.properties['Tags']),
      };

      // Validate required fields
      if (!rawData.title || rawData.amount === null || !rawData.category || 
          !rawData.status || !rawData.urgency) {
        logger.warn('Incomplete spending request data', {
          pageId: page.id,
          missing: {
            title: !rawData.title,
            amount: rawData.amount === null,
            category: !rawData.category,
            status: !rawData.status,
            urgency: !rawData.urgency,
          },
        });
        return null;
      }

      return {
        ...rawData,
        amount: rawData.amount!,
        description: rawData.description || undefined,
        decisionDate: rawData.decisionDate || undefined,
        reasoning: rawData.reasoning || undefined,
      };
    } catch (error) {
      logger.error('Failed to parse spending request from Notion page', {
        pageId: page.id,
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      return null;
    }
  }

  /**
   * Get pending spending requests with amount >= minimum threshold
   */
  async getPendingRequests(minimumAmount?: number): Promise<SpendingRequest[]> {
    try {
      // Validate input
      const validatedInput = GetPendingRequestsSchema.parse({ minimumAmount });
      const threshold = validatedInput.minimumAmount ?? this.config.minimumAmount;

      logger.info('Fetching pending spending requests', { 
        minimumAmount: threshold,
        databaseId: this.config.databaseId,
      });

      const filter = new FilterBuilder()
        .selectEquals('Status', 'Pending')
        .numberGreaterThanOrEqual('Amount', threshold)
        .build();

      const sorts = new SortBuilder()
        .descending('Request Date')
        .descending('Amount')
        .build();

      const pages = await this.notion.queryDatabase(this.config.databaseId, filter, sorts);

      const spendingRequests = pages
        .map(page => this.parseSpendingRequestFromPage(page))
        .filter((request): request is SpendingRequest => request !== null);

      logger.info('Successfully fetched pending spending requests', {
        totalFound: spendingRequests.length,
        minimumAmount: threshold,
        highUrgencyCount: spendingRequests.filter(r => ['High', 'Critical'].includes(r.urgency)).length,
      });

      return spendingRequests;
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Invalid input for getPendingRequests', {
          validationErrors: error.errors,
        });
        throw new SpendingRequestServiceError(
          'Invalid input parameters',
          'VALIDATION_ERROR',
          { validationErrors: error.errors },
        );
      }

      logger.error('Failed to fetch pending spending requests', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        minimumAmount,
      });
      
      throw new SpendingRequestServiceError(
        'Failed to fetch pending spending requests',
        'FETCH_PENDING_ERROR',
        { minimumAmount, originalError: error },
      );
    }
  }

  /**
   * Get spending from the last N days for context
   */
  async getRecentSpending(days: number = 30): Promise<SpendingRequest[]> {
    try {
      // Validate input
      const validatedInput = GetRecentSpendingSchema.parse({ days });
      
      logger.info('Fetching recent spending', { 
        days: validatedInput.days,
        databaseId: this.config.databaseId,
      });

      const startDate = dayjs().subtract(validatedInput.days, 'days').format('YYYY-MM-DD');
      const endDate = dayjs().format('YYYY-MM-DD');

      const filter = new FilterBuilder()
        .dateOnOrAfter('Request Date', startDate)
        .dateOnOrBefore('Request Date', endDate)
        .build();

      const sorts = new SortBuilder()
        .descending('Request Date')
        .descending('Amount')
        .build();

      const pages = await this.notion.queryDatabase(this.config.databaseId, filter, sorts);

      const spendingRequests = pages
        .map(page => this.parseSpendingRequestFromPage(page))
        .filter((request): request is SpendingRequest => request !== null);

      logger.info('Successfully fetched recent spending', {
        totalFound: spendingRequests.length,
        days: validatedInput.days,
        dateRange: `${startDate} to ${endDate}`,
        totalAmount: spendingRequests.reduce((sum, r) => sum + r.amount, 0),
      });

      return spendingRequests;
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Invalid input for getRecentSpending', {
          validationErrors: error.errors,
        });
        throw new SpendingRequestServiceError(
          'Invalid input parameters',
          'VALIDATION_ERROR',
          { validationErrors: error.errors },
        );
      }

      logger.error('Failed to fetch recent spending', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        days,
      });
      
      throw new SpendingRequestServiceError(
        'Failed to fetch recent spending',
        'FETCH_RECENT_ERROR',
        { days, originalError: error },
      );
    }
  }

  /**
   * Update spending request with decision and reasoning
   */
  async updateDecision(
    requestId: string,
    decision: SpendingStatus,
    reasoning: string,
  ): Promise<void> {
    try {
      // Validate input
      const validatedInput = UpdateDecisionSchema.parse({
        requestId,
        decision,
        reasoning,
      });

      logger.info('Updating spending request decision', {
        requestId: validatedInput.requestId,
        decision: validatedInput.decision,
        reasoningLength: validatedInput.reasoning.length,
      });

      // First, get the current page to ensure it exists and is in pending state
      const currentPage = await this.notion.getPage(validatedInput.requestId);
      const currentRequest = this.parseSpendingRequestFromPage(currentPage);

      if (!currentRequest) {
        throw new SpendingRequestServiceError(
          'Unable to parse current spending request data',
          'PARSE_ERROR',
          { requestId: validatedInput.requestId },
        );
      }

      if (currentRequest.status !== 'Pending') {
        throw new SpendingRequestServiceError(
          `Cannot update request with status '${currentRequest.status}'. Only pending requests can be updated.`,
          'INVALID_STATUS',
          { 
            currentStatus: currentRequest.status, 
            requestedStatus: validatedInput.decision,
            requestId: validatedInput.requestId,
          },
        );
      }

      // Update the page with decision
      const updateProperties = {
        'Status': this.notion.formatSelectProperty(validatedInput.decision),
        'Reasoning': this.notion.formatTextProperty(validatedInput.reasoning),
        'Decision Date': this.notion.formatDateProperty(new Date()),
      };

      await this.notion.updatePage(validatedInput.requestId, updateProperties);

      logger.info('Successfully updated spending request decision', {
        requestId: validatedInput.requestId,
        decision: validatedInput.decision,
        amount: currentRequest.amount,
        title: currentRequest.title,
        category: currentRequest.category,
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Invalid input for updateDecision', {
          requestId,
          decision,
          validationErrors: error.errors,
        });
        throw new SpendingRequestServiceError(
          'Invalid input parameters',
          'VALIDATION_ERROR',
          { validationErrors: error.errors },
        );
      }

      if (error instanceof SpendingRequestServiceError) {
        throw error;
      }

      logger.error('Failed to update spending request decision', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        requestId,
        decision,
      });
      
      throw new SpendingRequestServiceError(
        'Failed to update spending request decision',
        'UPDATE_DECISION_ERROR',
        { requestId, decision, originalError: error },
      );
    }
  }

  /**
   * Analyze spending patterns by category within date range
   */
  async getSpendingByCategory(startDate: Date, endDate: Date): Promise<SpendingPattern[]> {
    try {
      // Validate input
      const validatedInput = GetSpendingByCategorySchema.parse({ startDate, endDate });

      logger.info('Fetching spending by category', {
        startDate: validatedInput.startDate.toISOString(),
        endDate: validatedInput.endDate.toISOString(),
        databaseId: this.config.databaseId,
      });

      const filter = new FilterBuilder()
        .dateOnOrAfter('Request Date', dayjs(validatedInput.startDate).format('YYYY-MM-DD'))
        .dateOnOrBefore('Request Date', dayjs(validatedInput.endDate).format('YYYY-MM-DD'))
        .build();

      const pages = await this.notion.queryDatabase(this.config.databaseId, filter);

      const spendingRequests = pages
        .map(page => this.parseSpendingRequestFromPage(page))
        .filter((request): request is SpendingRequest => request !== null);

      // Group by category and calculate patterns
      const categoryMap = new Map<SpendingCategory, {
        totalAmount: number;
        requests: SpendingRequest[];
        approvedCount: number;
      }>();

      spendingRequests.forEach(request => {
        if (!categoryMap.has(request.category)) {
          categoryMap.set(request.category, {
            totalAmount: 0,
            requests: [],
            approvedCount: 0,
          });
        }

        const categoryData = categoryMap.get(request.category)!;
        categoryData.totalAmount += request.amount;
        categoryData.requests.push(request);
        if (request.status === 'Approved') {
          categoryData.approvedCount++;
        }
      });

      const patterns: SpendingPattern[] = Array.from(categoryMap.entries())
        .map(([category, data]) => ({
          category,
          totalAmount: data.totalAmount,
          requestCount: data.requests.length,
          averageAmount: data.totalAmount / data.requests.length,
          approvalRate: data.requests.length > 0 
            ? (data.approvedCount / data.requests.length) * 100 
            : 0,
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount);

      logger.info('Successfully calculated spending by category', {
        categoriesCount: patterns.length,
        totalRequests: spendingRequests.length,
        totalAmount: patterns.reduce((sum, p) => sum + p.totalAmount, 0),
        dateRange: `${dayjs(validatedInput.startDate).format('YYYY-MM-DD')} to ${dayjs(validatedInput.endDate).format('YYYY-MM-DD')}`,
      });

      return patterns;
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Invalid input for getSpendingByCategory', {
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
          validationErrors: error.errors,
        });
        throw new SpendingRequestServiceError(
          'Invalid input parameters',
          'VALIDATION_ERROR',
          { validationErrors: error.errors },
        );
      }

      logger.error('Failed to fetch spending by category', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
      });
      
      throw new SpendingRequestServiceError(
        'Failed to fetch spending by category',
        'FETCH_CATEGORY_ERROR',
        { startDate, endDate, originalError: error },
      );
    }
  }

  /**
   * Build comprehensive spending context for decision making
   */
  async buildSpendingContext(days: number = 30): Promise<FinancialContext> {
    try {
      // Validate input
      const validatedInput = BuildSpendingContextSchema.parse({ days });

      logger.info('Building spending context', { 
        days: validatedInput.days,
        databaseId: this.config.databaseId,
      });

      // Fetch recent spending data
      const recentSpending = await this.getRecentSpending(validatedInput.days);
      
      const now = dayjs();
      const monthStart = now.startOf('month').toDate();
      const weekStart = now.startOf('week').toDate();
      
      // Calculate category breakdown
      const categoryBreakdown = FinancialContextHelpers.calculateCategoryBreakdown(recentSpending);

      // Filter requests by time periods
      const monthlyRequests = recentSpending.filter(request => 
        dayjs(request.requestDate).isAfter(monthStart)
      );

      const weeklyRequests = recentSpending.filter(request => 
        dayjs(request.requestDate).isAfter(weekStart)
      );

      // Calculate totals and averages
      const monthlyTotal = monthlyRequests.reduce((sum, request) => sum + request.amount, 0);
      const weeklyTotal = weeklyRequests.reduce((sum, request) => sum + request.amount, 0);
      const averageRequestAmount = recentSpending.length > 0 
        ? recentSpending.reduce((sum, request) => sum + request.amount, 0) / recentSpending.length
        : 0;

      const urgentRequestsCount = recentSpending.filter(request => 
        ['High', 'Critical'].includes(request.urgency)
      ).length;

      const context: FinancialContext = {
        recentSpending,
        monthlyTotal,
        weeklyTotal,
        averageRequestAmount,
        categoryBreakdown,
        urgentRequestsCount,
      };

      logger.info('Successfully built spending context', {
        recentRequestsCount: recentSpending.length,
        monthlyTotal,
        weeklyTotal,
        averageRequestAmount: Math.round(averageRequestAmount * 100) / 100,
        categoriesWithSpending: Object.keys(categoryBreakdown).filter(cat => categoryBreakdown[cat as SpendingCategory] > 0).length,
        urgentRequestsCount,
      });

      return context;
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Invalid input for buildSpendingContext', {
          days,
          validationErrors: error.errors,
        });
        throw new SpendingRequestServiceError(
          'Invalid input parameters',
          'VALIDATION_ERROR',
          { validationErrors: error.errors },
        );
      }

      if (error instanceof SpendingRequestServiceError) {
        throw error;
      }

      logger.error('Failed to build spending context', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        days,
      });
      
      throw new SpendingRequestServiceError(
        'Failed to build spending context',
        'BUILD_CONTEXT_ERROR',
        { days, originalError: error },
      );
    }
  }

  /**
   * Calculate spending trends over multiple months
   */
  async calculateSpendingTrends(months: number = 6): Promise<SpendingTrend[]> {
    try {
      // Validate input
      const validatedMonths = z.number().int().min(1).max(24).parse(months);

      logger.info('Calculating spending trends', { 
        months: validatedMonths,
        databaseId: this.config.databaseId,
      });

      const trends: SpendingTrend[] = [];
      const now = dayjs();

      for (let i = 0; i < validatedMonths; i++) {
        const monthStart = now.subtract(i, 'months').startOf('month');
        const monthEnd = monthStart.endOf('month');
        
        logger.debug('Processing trend for month', {
          month: monthStart.format('YYYY-MM'),
          startDate: monthStart.format('YYYY-MM-DD'),
          endDate: monthEnd.format('YYYY-MM-DD'),
        });

        const monthlyPatterns = await this.getSpendingByCategory(
          monthStart.toDate(),
          monthEnd.toDate(),
        );

        const totalSpending = monthlyPatterns.reduce((sum, pattern) => sum + pattern.totalAmount, 0);
        const requestCount = monthlyPatterns.reduce((sum, pattern) => sum + pattern.requestCount, 0);
        const averageAmount = requestCount > 0 ? totalSpending / requestCount : 0;

        // Get top 3 categories by spending
        const topCategories = monthlyPatterns
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, 3);

        trends.push({
          period: monthStart.format('YYYY-MM'),
          totalSpending,
          requestCount,
          averageAmount,
          topCategories,
        });
      }

      // Sort by period descending (most recent first)
      trends.sort((a, b) => b.period.localeCompare(a.period));

      logger.info('Successfully calculated spending trends', {
        trendsCount: trends.length,
        months: validatedMonths,
        totalPeriods: trends.length,
        averageMonthlySpending: trends.length > 0 
          ? Math.round(trends.reduce((sum, t) => sum + t.totalSpending, 0) / trends.length * 100) / 100
          : 0,
      });

      return trends;
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Invalid input for calculateSpendingTrends', {
          months,
          validationErrors: error.errors,
        });
        throw new SpendingRequestServiceError(
          'Invalid input parameters',
          'VALIDATION_ERROR',
          { validationErrors: error.errors },
        );
      }

      if (error instanceof SpendingRequestServiceError) {
        throw error;
      }

      logger.error('Failed to calculate spending trends', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        months,
      });
      
      throw new SpendingRequestServiceError(
        'Failed to calculate spending trends',
        'CALCULATE_TRENDS_ERROR',
        { months, originalError: error },
      );
    }
  }

  /**
   * Validate spending request data against business rules
   */
  async validateSpendingRequest(request: Partial<SpendingRequest>): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      logger.debug('Validating spending request', {
        requestId: request.id,
        amount: request.amount,
        category: request.category,
        urgency: request.urgency,
      });

      // Required field validation
      if (!request.title || request.title.trim().length === 0) {
        errors.push('Title is required and cannot be empty');
      } else if (request.title.length > 200) {
        warnings.push('Title is very long and may be truncated');
      }

      if (request.amount === null || request.amount === undefined) {
        errors.push('Amount is required');
      } else {
        if (request.amount <= 0) {
          errors.push('Amount must be greater than zero');
        }
        if (request.amount > 10000) {
          warnings.push('Amount is very high and may require additional approvals');
        }
      }

      if (!request.category) {
        errors.push('Category is required');
      }

      if (!request.urgency) {
        errors.push('Urgency level is required');
      }

      // Business logic warnings
      if (request.amount && request.amount > 1000) {
        warnings.push('High amount request requires detailed justification');
      }

      if (request.urgency === 'Critical' && !request.description) {
        warnings.push('Critical requests should include detailed description');
      }

      if (request.category === 'Entertainment' && request.amount && request.amount > 200) {
        warnings.push('Entertainment expenses over $200 require additional review');
      }

      if (request.category === 'Emergency' && request.urgency !== 'Critical' && request.urgency !== 'High') {
        warnings.push('Emergency category should typically have High or Critical urgency');
      }

      const isValid = errors.length === 0;

      logger.debug('Spending request validation completed', {
        requestId: request.id,
        isValid,
        errorCount: errors.length,
        warningCount: warnings.length,
      });

      return { isValid, errors, warnings };

    } catch (error) {
      logger.error('Error during spending request validation', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        requestId: request.id,
      });

      return {
        isValid: false,
        errors: ['Validation failed due to internal error'],
        warnings: [],
      };
    }
  }

  /**
   * Get service health and performance metrics
   */
  getServiceMetrics(): {
    databaseId: string;
    minimumAmount: number;
    notionClientMetrics: any;
    lastOperationTime?: Date;
  } {
    return {
      databaseId: this.config.databaseId,
      minimumAmount: this.config.minimumAmount,
      notionClientMetrics: this.notion.getMetrics(),
      lastOperationTime: new Date(),
    };
  }
}