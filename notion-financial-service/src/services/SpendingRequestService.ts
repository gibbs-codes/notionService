import { logger } from '../config/logger';
import { NotionClient } from './NotionClient';
import { FilterBuilder, SortBuilder } from './FilterBuilder';
import {
  SpendingRequest,
  SpendingRequestDecision,
  SpendingRequestDecisionSchema,
  SpendingCategory,
  SpendingRequestStatus,
  UrgencyLevel,
  NotionPageBase,
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

export interface SpendingContext {
  recentSpending: SpendingRequest[];
  categoryBreakdown: SpendingPattern[];
  monthlyTotal: number;
  weeklyTotal: number;
  averageRequestAmount: number;
  highUrgencyCount: number;
}

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
        title: this.notion.extractTitle(page, 'Title') || this.notion.extractText(page, 'Title'),
        amount: this.notion.extractNumber(page, 'Amount'),
        description: this.notion.extractText(page, 'Description'),
        category: this.notion.extractSelect(page, 'Category') as SpendingCategory,
        status: this.notion.extractSelect(page, 'Status') as SpendingRequestStatus,
        requestDate: this.notion.extractDate(page, 'Request Date') || new Date(page.created_time),
        decidedDate: this.notion.extractDate(page, 'Decided Date'),
        reasoning: this.notion.extractText(page, 'Reasoning'),
        urgencyLevel: this.notion.extractSelect(page, 'Urgency') as UrgencyLevel,
        tags: this.notion.extractMultiSelect(page, 'Tags'),
      };

      // Validate required fields
      if (!rawData.title || rawData.amount === null || !rawData.category || !rawData.status || !rawData.urgencyLevel) {
        logger.warn('Incomplete spending request data', {
          pageId: page.id,
          missing: {
            title: !rawData.title,
            amount: rawData.amount === null,
            category: !rawData.category,
            status: !rawData.status,
            urgencyLevel: !rawData.urgencyLevel,
          },
        });
        return null;
      }

      return {
        ...rawData,
        amount: rawData.amount!,
        description: rawData.description || undefined,
        decidedDate: rawData.decidedDate || undefined,
        reasoning: rawData.reasoning || undefined,
      };
    } catch (error) {
      logger.error('Failed to parse spending request from Notion page', {
        pageId: page.id,
        error: (error as Error).message,
      });
      return null;
    }
  }

  async getPendingRequests(minimumAmount?: number): Promise<SpendingRequest[]> {
    const threshold = minimumAmount ?? this.config.minimumAmount;

    try {
      logger.info('Fetching pending spending requests', { minimumAmount: threshold });

      const filter = new FilterBuilder()
        .selectEquals('Status', 'pending')
        .numberGreaterThanOrEqual('Amount', threshold)
        .build();

      const sorts = new SortBuilder()
        .descending('Request Date')
        .descending('Amount')
        .build();

      const pages = await this.notion.queryDatabase(this.config.databaseId, {
        filter,
        sorts,
        page_size: this.config.defaultPageSize,
      });

      const spendingRequests = pages
        .map(page => this.parseSpendingRequestFromPage(page))
        .filter((request): request is SpendingRequest => request !== null);

      logger.info('Successfully fetched pending spending requests', {
        totalFound: spendingRequests.length,
        minimumAmount: threshold,
      });

      return spendingRequests;
    } catch (error) {
      logger.error('Failed to fetch pending spending requests', {
        error: (error as Error).message,
        minimumAmount: threshold,
      });
      throw new SpendingRequestServiceError(
        'Failed to fetch pending spending requests',
        'FETCH_PENDING_ERROR',
        { minimumAmount: threshold, originalError: error },
      );
    }
  }

  async getRecentSpending(days: number = 30): Promise<SpendingRequest[]> {
    try {
      logger.info('Fetching recent spending', { days });

      const startDate = dayjs().subtract(days, 'days').format('YYYY-MM-DD');

      const filter = new FilterBuilder()
        .dateOnOrAfter('Request Date', startDate)
        .build();

      const sorts = new SortBuilder()
        .descending('Request Date')
        .descending('Amount')
        .build();

      const pages = await this.notion.queryDatabase(this.config.databaseId, {
        filter,
        sorts,
        page_size: this.config.defaultPageSize,
      });

      const spendingRequests = pages
        .map(page => this.parseSpendingRequestFromPage(page))
        .filter((request): request is SpendingRequest => request !== null);

      logger.info('Successfully fetched recent spending', {
        totalFound: spendingRequests.length,
        days,
        dateRange: `${startDate} to ${dayjs().format('YYYY-MM-DD')}`,
      });

      return spendingRequests;
    } catch (error) {
      logger.error('Failed to fetch recent spending', {
        error: (error as Error).message,
        days,
      });
      throw new SpendingRequestServiceError(
        'Failed to fetch recent spending',
        'FETCH_RECENT_ERROR',
        { days, originalError: error },
      );
    }
  }

  async createDecisionUpdate(
    requestId: string,
    decision: 'approved' | 'denied',
    reasoning: string,
  ): Promise<SpendingRequest> {
    try {
      // Validate input
      const decisionData = SpendingRequestDecisionSchema.parse({
        id: requestId,
        status: decision,
        reasoning,
      });

      logger.info('Creating spending request decision', {
        requestId,
        decision,
        reasoningLength: reasoning.length,
      });

      // First, get the current page to ensure it exists and is in pending state
      const currentPage = await this.notion.getPage(requestId);
      const currentStatus = this.notion.extractSelect(currentPage, 'Status');

      if (currentStatus !== 'pending') {
        throw new SpendingRequestServiceError(
          `Cannot update request with status '${currentStatus}'. Only pending requests can be updated.`,
          'INVALID_STATUS',
          { currentStatus, requestedStatus: decision },
        );
      }

      // Update the page
      const updatedPage = await this.notion.updatePage(requestId, {
        'Status': this.notion.formatSelect(decision),
        'Reasoning': this.notion.formatText(reasoning),
        'Decided Date': this.notion.formatDate(decisionData.decidedDate),
      });

      const updatedRequest = this.parseSpendingRequestFromPage(updatedPage);
      if (!updatedRequest) {
        throw new SpendingRequestServiceError(
          'Failed to parse updated spending request',
          'PARSE_ERROR',
          { requestId },
        );
      }

      logger.info('Successfully updated spending request decision', {
        requestId,
        decision,
        amount: updatedRequest.amount,
        title: updatedRequest.title,
      });

      return updatedRequest;
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Invalid decision data', {
          requestId,
          decision,
          validationErrors: error.errors,
        });
        throw new SpendingRequestServiceError(
          'Invalid decision data provided',
          'VALIDATION_ERROR',
          { validationErrors: error.errors },
        );
      }

      if (error instanceof SpendingRequestServiceError) {
        throw error;
      }

      logger.error('Failed to create spending request decision', {
        error: (error as Error).message,
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

  async getSpendingByCategory(startDate: Date, endDate: Date): Promise<SpendingPattern[]> {
    try {
      logger.info('Fetching spending by category', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      const filter = new FilterBuilder()
        .dateOnOrAfter('Request Date', dayjs(startDate).format('YYYY-MM-DD'))
        .dateOnOrBefore('Request Date', dayjs(endDate).format('YYYY-MM-DD'))
        .build();

      const pages = await this.notion.queryDatabase(this.config.databaseId, {
        filter,
        page_size: this.config.defaultPageSize,
      });

      const spendingRequests = pages
        .map(page => this.parseSpendingRequestFromPage(page))
        .filter((request): request is SpendingRequest => request !== null);

      const categoryMap = new Map<SpendingCategory, {
        totalAmount: number;
        requests: SpendingRequest[];
        approvedCount: number;
      }>();

      // Aggregate by category
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
        if (request.status === 'approved') {
          categoryData.approvedCount++;
        }
      });

      const patterns: SpendingPattern[] = Array.from(categoryMap.entries()).map(([category, data]) => ({
        category,
        totalAmount: data.totalAmount,
        requestCount: data.requests.length,
        averageAmount: data.totalAmount / data.requests.length,
        approvalRate: data.requests.length > 0 ? (data.approvedCount / data.requests.length) * 100 : 0,
      }));

      // Sort by total amount descending
      patterns.sort((a, b) => b.totalAmount - a.totalAmount);

      logger.info('Successfully calculated spending by category', {
        categoriesCount: patterns.length,
        totalRequests: spendingRequests.length,
        dateRange: `${dayjs(startDate).format('YYYY-MM-DD')} to ${dayjs(endDate).format('YYYY-MM-DD')}`,
      });

      return patterns;
    } catch (error) {
      logger.error('Failed to fetch spending by category', {
        error: (error as Error).message,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      throw new SpendingRequestServiceError(
        'Failed to fetch spending by category',
        'FETCH_CATEGORY_ERROR',
        { startDate, endDate, originalError: error },
      );
    }
  }

  async getSpendingContext(days: number = 30): Promise<SpendingContext> {
    try {
      logger.info('Building spending context', { days });

      const recentSpending = await this.getRecentSpending(days);
      
      const now = dayjs();
      const monthStart = now.startOf('month').toDate();
      const weekStart = now.startOf('week').toDate();
      
      const categoryBreakdown = await this.getSpendingByCategory(
        dayjs().subtract(days, 'days').toDate(),
        now.toDate(),
      );

      const monthlyRequests = recentSpending.filter(request => 
        dayjs(request.requestDate).isAfter(monthStart)
      );

      const weeklyRequests = recentSpending.filter(request => 
        dayjs(request.requestDate).isAfter(weekStart)
      );

      const monthlyTotal = monthlyRequests.reduce((sum, request) => sum + request.amount, 0);
      const weeklyTotal = weeklyRequests.reduce((sum, request) => sum + request.amount, 0);
      const averageRequestAmount = recentSpending.length > 0 
        ? recentSpending.reduce((sum, request) => sum + request.amount, 0) / recentSpending.length
        : 0;

      const highUrgencyCount = recentSpending.filter(request => 
        ['high', 'urgent'].includes(request.urgencyLevel)
      ).length;

      const context: SpendingContext = {
        recentSpending,
        categoryBreakdown,
        monthlyTotal,
        weeklyTotal,
        averageRequestAmount,
        highUrgencyCount,
      };

      logger.info('Successfully built spending context', {
        recentRequestsCount: recentSpending.length,
        monthlyTotal,
        weeklyTotal,
        categoriesCount: categoryBreakdown.length,
        highUrgencyCount,
      });

      return context;
    } catch (error) {
      logger.error('Failed to build spending context', {
        error: (error as Error).message,
        days,
      });
      throw new SpendingRequestServiceError(
        'Failed to build spending context',
        'BUILD_CONTEXT_ERROR',
        { days, originalError: error },
      );
    }
  }

  async calculateSpendingTrend(months: number = 6): Promise<SpendingTrend[]> {
    try {
      logger.info('Calculating spending trends', { months });

      const trends: SpendingTrend[] = [];
      const now = dayjs();

      for (let i = 0; i < months; i++) {
        const monthStart = now.subtract(i, 'months').startOf('month');
        const monthEnd = monthStart.endOf('month');
        
        const monthlyPatterns = await this.getSpendingByCategory(
          monthStart.toDate(),
          monthEnd.toDate(),
        );

        const totalSpending = monthlyPatterns.reduce((sum, pattern) => sum + pattern.totalAmount, 0);
        const requestCount = monthlyPatterns.reduce((sum, pattern) => sum + pattern.requestCount, 0);
        const averageAmount = requestCount > 0 ? totalSpending / requestCount : 0;

        // Get top 3 categories
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
        months,
      });

      return trends;
    } catch (error) {
      logger.error('Failed to calculate spending trends', {
        error: (error as Error).message,
        months,
      });
      throw new SpendingRequestServiceError(
        'Failed to calculate spending trends',
        'CALCULATE_TRENDS_ERROR',
        { months, originalError: error },
      );
    }
  }

  async validateSpendingRequest(request: Partial<SpendingRequest>): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required field validation
    if (!request.title || request.title.trim().length === 0) {
      errors.push('Title is required');
    }

    if (request.amount === null || request.amount === undefined) {
      errors.push('Amount is required');
    } else if (request.amount <= 0) {
      errors.push('Amount must be positive');
    }

    if (!request.category) {
      errors.push('Category is required');
    }

    if (!request.urgencyLevel) {
      errors.push('Urgency level is required');
    }

    // Business logic warnings
    if (request.amount && request.amount > 1000) {
      warnings.push('High amount request requires additional justification');
    }

    if (request.urgencyLevel === 'urgent' && !request.description) {
      warnings.push('Urgent requests should include detailed description');
    }

    if (request.category === 'entertainment' && request.amount && request.amount > 200) {
      warnings.push('Entertainment expenses over $200 require review');
    }

    const isValid = errors.length === 0;

    logger.debug('Spending request validation completed', {
      isValid,
      errorCount: errors.length,
      warningCount: warnings.length,
      amount: request.amount,
      category: request.category,
    });

    return { isValid, errors, warnings };
  }
}