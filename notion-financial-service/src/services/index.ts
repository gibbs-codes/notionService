import { logger } from '../config/logger';
import { config } from '../config';
import { NotionClient, NotionClientConfig } from './NotionClient';
import { SpendingRequestService, SpendingRequestServiceConfig } from './SpendingRequestService';
import { FinancialDataService, FinancialDataServiceConfig } from './FinancialDataService';
import { DecisionContextService } from './DecisionContextService';
import { HealthStatus, DecisionContext, SpendingRequest } from '../types';
import { z } from 'zod';

export interface NotionFinancialServiceConfig extends NotionClientConfig {
  spendingDatabase: string;
  goalsDatabase?: string;
  debtsDatabase?: string;
  accountsDatabase?: string;
  defaultMonthlyBudget?: number;
  minimumSpendingAmount?: number;
}

export class NotionFinancialServiceError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any,
  ) {
    super(message);
    this.name = 'NotionFinancialServiceError';
  }
}

const NotionFinancialServiceConfigSchema = z.object({
  token: z.string().min(1, 'Notion token is required'),
  spendingDatabase: z.string().min(1, 'Spending database ID is required'),
  goalsDatabase: z.string().optional(),
  debtsDatabase: z.string().optional(),
  accountsDatabase: z.string().optional(),
  defaultMonthlyBudget: z.number().positive().default(3000),
  minimumSpendingAmount: z.number().positive().default(50),
  maxRetries: z.number().int().min(1).max(10).default(3),
  baseDelay: z.number().positive().default(1000),
  maxDelay: z.number().positive().default(30000),
  requestTimeout: z.number().positive().default(30000),
  rateLimit: z.object({
    requestsPerSecond: z.number().positive().default(3),
  }).default({ requestsPerSecond: 3 }),
  cache: z.object({
    enabled: z.boolean().default(true),
    ttlMs: z.number().positive().default(300000), // 5 minutes
    maxSize: z.number().int().positive().default(1000),
  }).default({
    enabled: true,
    ttlMs: 300000,
    maxSize: 1000,
  }),
});

/**
 * Main service orchestrator for Notion-based financial services
 * Manages all financial operations including spending requests, goals, debts, and accounts
 */
export class NotionFinancialService {
  private notionClient: NotionClient;
  private spendingService: SpendingRequestService;
  private financialDataService: FinancialDataService;
  private decisionContextService: DecisionContextService;
  private config: z.infer<typeof NotionFinancialServiceConfigSchema>;
  private initialized = false;
  private startTime = Date.now();

  constructor(inputConfig: NotionFinancialServiceConfig) {
    try {
      // Validate configuration
      this.config = NotionFinancialServiceConfigSchema.parse(inputConfig);

      logger.info('Initializing NotionFinancialService', {
        spendingDatabase: this.config.spendingDatabase,
        goalsDatabase: this.config.goalsDatabase,
        debtsDatabase: this.config.debtsDatabase,
        accountsDatabase: this.config.accountsDatabase,
        defaultMonthlyBudget: this.config.defaultMonthlyBudget,
        cacheEnabled: this.config.cache.enabled,
      });

      // Initialize Notion client
      this.notionClient = new NotionClient({
        token: this.config.token,
        maxRetries: this.config.maxRetries,
        baseDelay: this.config.baseDelay,
        maxDelay: this.config.maxDelay,
        requestTimeout: this.config.requestTimeout,
        rateLimit: this.config.rateLimit,
        cache: this.config.cache,
      });

      // Initialize spending service
      const spendingConfig: SpendingRequestServiceConfig = {
        databaseId: this.config.spendingDatabase,
        minimumAmount: this.config.minimumSpendingAmount,
      };
      this.spendingService = new SpendingRequestService(this.notionClient, spendingConfig);

      // Initialize financial data service
      const financialConfig: FinancialDataServiceConfig = {
        goalsDatabase: this.config.goalsDatabase,
        debtsDatabase: this.config.debtsDatabase,
        accountsDatabase: this.config.accountsDatabase,
        defaultMonthlyBudget: this.config.defaultMonthlyBudget,
      };
      this.financialDataService = new FinancialDataService(this.notionClient, financialConfig);

      // Initialize decision context service
      this.decisionContextService = new DecisionContextService(
        this.spendingService,
        this.financialDataService,
      );

      logger.info('NotionFinancialService created successfully', {
        servicesInitialized: 4,
        configValidated: true,
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Invalid configuration for NotionFinancialService', {
          validationErrors: error.errors,
        });
        throw new NotionFinancialServiceError(
          'Invalid configuration provided',
          'INVALID_CONFIG',
          { validationErrors: error.errors },
        );
      }

      logger.error('Failed to create NotionFinancialService', {
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      
      throw new NotionFinancialServiceError(
        'Failed to initialize service',
        'INIT_ERROR',
        { originalError: error },
      );
    }
  }

  /**
   * Initialize the service and validate connections
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing NotionFinancialService connections');

      // Test Notion client connection by getting database schema for spending database
      try {
        await this.notionClient.getDatabaseSchema(this.config.spendingDatabase);
        logger.info('Spending database connection verified');
      } catch (error) {
        throw new NotionFinancialServiceError(
          'Failed to connect to spending database',
          'SPENDING_DB_ERROR',
          { databaseId: this.config.spendingDatabase, originalError: error },
        );
      }

      // Test optional databases if configured
      if (this.config.goalsDatabase) {
        try {
          await this.notionClient.getDatabaseSchema(this.config.goalsDatabase);
          logger.info('Goals database connection verified');
        } catch (error) {
          logger.warn('Failed to connect to goals database', {
            databaseId: this.config.goalsDatabase,
            error: (error as Error).message,
          });
        }
      }

      if (this.config.debtsDatabase) {
        try {
          await this.notionClient.getDatabaseSchema(this.config.debtsDatabase);
          logger.info('Debts database connection verified');
        } catch (error) {
          logger.warn('Failed to connect to debts database', {
            databaseId: this.config.debtsDatabase,
            error: (error as Error).message,
          });
        }
      }

      if (this.config.accountsDatabase) {
        try {
          await this.notionClient.getDatabaseSchema(this.config.accountsDatabase);
          logger.info('Accounts database connection verified');
        } catch (error) {
          logger.warn('Failed to connect to accounts database', {
            databaseId: this.config.accountsDatabase,
            error: (error as Error).message,
          });
        }
      }

      this.initialized = true;
      logger.info('NotionFinancialService initialized successfully', {
        initializationTime: Date.now() - this.startTime,
        allServicesReady: true,
      });

    } catch (error) {
      if (error instanceof NotionFinancialServiceError) {
        throw error;
      }

      logger.error('Failed to initialize NotionFinancialService', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        initializationTime: Date.now() - this.startTime,
      });
      
      throw new NotionFinancialServiceError(
        'Service initialization failed',
        'INIT_FAILED',
        { originalError: error },
      );
    }
  }

  /**
   * Perform comprehensive health check of all services
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      logger.debug('Performing health check');

      const healthCheckStart = Date.now();

      // Check Notion client health
      const notionMetrics = this.notionClient.getMetrics();
      const notionHealthy = notionMetrics.successRate > 80; // 80% success rate threshold

      let notionStatus: 'healthy' | 'degraded' | 'unhealthy';
      if (notionMetrics.successRate > 95) {
        notionStatus = 'healthy';
      } else if (notionMetrics.successRate > 80) {
        notionStatus = 'degraded';
      } else {
        notionStatus = 'unhealthy';
      }

      // Check spending service health
      const spendingMetrics = this.spendingService.getServiceMetrics();
      let spendingStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      // Check financial data service health
      const financialMetrics = this.financialDataService.getServiceMetrics();
      const financialErrorRate = financialMetrics.errorRate;
      
      let financialStatus: 'healthy' | 'degraded' | 'unhealthy';
      if (financialErrorRate < 5) {
        financialStatus = 'healthy';
      } else if (financialErrorRate < 15) {
        financialStatus = 'degraded';
      } else {
        financialStatus = 'unhealthy';
      }

      // Determine overall health
      const services = [notionStatus, spendingStatus, financialStatus];
      let overall: 'healthy' | 'degraded' | 'unhealthy';
      
      if (services.every(s => s === 'healthy')) {
        overall = 'healthy';
      } else if (services.some(s => s === 'unhealthy')) {
        overall = 'unhealthy';
      } else {
        overall = 'degraded';
      }

      const healthStatus: HealthStatus = {
        overall,
        services: {
          notionClient: {
            status: notionStatus,
            metrics: notionMetrics,
            lastCheck: new Date(),
          },
          spendingService: {
            status: spendingStatus,
            lastOperation: spendingMetrics.notionClientMetrics?.lastOperationTime,
            errorRate: 0, // SpendingRequestService doesn't track error rate yet
          },
          financialDataService: {
            status: financialStatus,
            lastOperation: financialMetrics.lastOperationTime,
            errorRate: financialErrorRate,
          },
        },
        timestamp: new Date(),
        uptime: Date.now() - this.startTime,
      };

      logger.info('Health check completed', {
        overall: healthStatus.overall,
        duration: Date.now() - healthCheckStart,
        notionSuccessRate: notionMetrics.successRate,
        financialErrorRate,
        uptime: healthStatus.uptime,
      });

      return healthStatus;

    } catch (error) {
      logger.error('Health check failed', {
        error: (error as Error).message,
        stack: (error as Error).stack,
      });

      // Return unhealthy status if health check itself fails
      return {
        overall: 'unhealthy',
        services: {
          notionClient: {
            status: 'unhealthy',
            metrics: {},
            lastCheck: new Date(),
          },
          spendingService: {
            status: 'unhealthy',
          },
          financialDataService: {
            status: 'unhealthy',
          },
        },
        timestamp: new Date(),
        uptime: Date.now() - this.startTime,
      };
    }
  }

  /**
   * Get all pending spending requests
   */
  async getPendingRequests(minimumAmount?: number): Promise<SpendingRequest[]> {
    this.ensureInitialized();
    return this.spendingService.getPendingRequests(minimumAmount);
  }

  /**
   * Build comprehensive decision context for a spending request
   */
  async buildDecisionContext(requestId: string): Promise<DecisionContext> {
    this.ensureInitialized();
    return this.decisionContextService.buildDecisionContext(requestId);
  }

  /**
   * Update spending request decision
   */
  async updateSpendingDecision(
    requestId: string,
    decision: 'Approved' | 'Denied',
    reasoning: string,
  ): Promise<void> {
    this.ensureInitialized();
    return this.spendingService.updateDecision(requestId, decision, reasoning);
  }

  /**
   * Get recent spending for context
   */
  async getRecentSpending(days: number = 30): Promise<SpendingRequest[]> {
    this.ensureInitialized();
    return this.spendingService.getRecentSpending(days);
  }

  /**
   * Build spending context
   */
  async buildSpendingContext(days: number = 30) {
    this.ensureInitialized();
    return this.spendingService.buildSpendingContext(days);
  }

  /**
   * Get active financial goals
   */
  async getActiveGoals() {
    this.ensureInitialized();
    return this.financialDataService.getActiveGoals();
  }

  /**
   * Get all debts
   */
  async getAllDebts() {
    this.ensureInitialized();
    return this.financialDataService.getAllDebts();
  }

  /**
   * Get account balances
   */
  async getAccountBalances() {
    this.ensureInitialized();
    return this.financialDataService.getAccountBalances();
  }

  /**
   * Get monthly budget status
   */
  async getBudgetStatus(monthlyBudget?: number, month?: string) {
    this.ensureInitialized();
    return this.financialDataService.getMonthlyBudgetStatus(monthlyBudget, month);
  }

  /**
   * Calculate available funds
   */
  async calculateAvailableFunds(): Promise<number> {
    this.ensureInitialized();
    return this.financialDataService.calculateAvailableFunds();
  }

  /**
   * Get service metrics and performance data
   */
  getServiceMetrics() {
    return {
      initialized: this.initialized,
      uptime: Date.now() - this.startTime,
      notionClient: this.notionClient.getMetrics(),
      spendingService: this.spendingService.getServiceMetrics(),
      financialDataService: this.financialDataService.getServiceMetrics(),
      decisionContextService: this.decisionContextService.getServiceMetrics(),
      configuration: {
        spendingDatabase: this.config.spendingDatabase,
        goalsConfigured: !!this.config.goalsDatabase,
        debtsConfigured: !!this.config.debtsDatabase,
        accountsConfigured: !!this.config.accountsDatabase,
        defaultBudget: this.config.defaultMonthlyBudget,
        minimumSpendingAmount: this.config.minimumSpendingAmount,
      },
    };
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.notionClient.clearCache();
    logger.info('All service caches cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      notionClient: this.notionClient.getCacheStats(),
    };
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new NotionFinancialServiceError(
        'Service not initialized. Call initialize() first.',
        'NOT_INITIALIZED',
      );
    }
  }
}

// Convenience function to create and initialize the service
export async function createNotionFinancialService(
  config: NotionFinancialServiceConfig,
): Promise<NotionFinancialService> {
  const service = new NotionFinancialService(config);
  await service.initialize();
  return service;
}

// Export all services for individual use if needed
export { NotionClient } from './NotionClient';
export { SpendingRequestService } from './SpendingRequestService';
export { FinancialDataService } from './FinancialDataService';
export { DecisionContextService } from './DecisionContextService';
export { FilterBuilder, SortBuilder } from './FilterBuilder';

// Export service errors
export {
  NotionFinancialServiceError,
  NotionError,
  NotionRateLimitError,
  NotionAuthError,
  NotionPermissionError,
  NotionNotFoundError,
  NotionTimeoutError,
  NotionConnectionError,
} from './NotionClient';

export { SpendingRequestServiceError } from './SpendingRequestService';
export { FinancialDataServiceError } from './FinancialDataService';
export { DecisionContextServiceError } from './DecisionContextService';