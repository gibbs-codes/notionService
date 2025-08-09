import { createNotionFinancialService, NotionFinancialServiceConfig } from './src/services';
import { logger } from './src/config/logger';

/**
 * Example usage of the NotionFinancialService
 * This demonstrates how to use all the services together
 */
async function exampleUsage() {
  try {
    // Configuration for the service
    const config: NotionFinancialServiceConfig = {
      token: process.env.NOTION_TOKEN || 'your_notion_token',
      spendingDatabase: process.env.SPENDING_DATABASE_ID || 'your_spending_db_id',
      goalsDatabase: process.env.GOALS_DATABASE_ID,
      debtsDatabase: process.env.DEBTS_DATABASE_ID,
      accountsDatabase: process.env.ACCOUNTS_DATABASE_ID,
      defaultMonthlyBudget: 3000,
      minimumSpendingAmount: 50,
      maxRetries: 3,
      rateLimit: {
        requestsPerSecond: 3,
      },
    };

    logger.info('Creating NotionFinancialService with configuration');

    // Create and initialize the service
    const financialService = await createNotionFinancialService(config);

    logger.info('NotionFinancialService initialized successfully');

    // Perform health check
    const healthStatus = await financialService.healthCheck();
    logger.info('Health check result', {
      overall: healthStatus.overall,
      uptime: healthStatus.uptime,
    });

    // Example 1: Get pending spending requests
    logger.info('Fetching pending spending requests...');
    const pendingRequests = await financialService.getPendingRequests();
    logger.info(`Found ${pendingRequests.length} pending requests`);

    // Example 2: Get recent spending for context
    logger.info('Fetching recent spending...');
    const recentSpending = await financialService.getRecentSpending(30);
    logger.info(`Found ${recentSpending.length} recent spending requests`);

    // Example 3: Build spending context
    logger.info('Building spending context...');
    const spendingContext = await financialService.buildSpendingContext(30);
    logger.info('Spending context built', {
      monthlyTotal: spendingContext.monthlyTotal,
      weeklyTotal: spendingContext.weeklyTotal,
      averageAmount: spendingContext.averageRequestAmount,
      urgentCount: spendingContext.urgentRequestsCount,
    });

    // Example 4: Get financial data
    logger.info('Fetching financial data...');
    const [goals, debts, accounts] = await Promise.all([
      financialService.getActiveGoals().catch(() => []),
      financialService.getAllDebts().catch(() => []),
      financialService.getAccountBalances().catch(() => []),
    ]);

    logger.info('Financial data fetched', {
      goalsCount: goals.length,
      debtsCount: debts.length,
      accountsCount: accounts.length,
    });

    // Example 5: Get budget status
    logger.info('Getting budget status...');
    const budgetStatus = await financialService.getBudgetStatus();
    logger.info('Budget status', {
      budget: budgetStatus.monthlyBudget,
      remaining: budgetStatus.remainingBudget,
      percentageUsed: budgetStatus.percentageUsed,
      health: budgetStatus.budgetHealth,
    });

    // Example 6: Build decision context (if there are pending requests)
    if (pendingRequests.length > 0) {
      logger.info('Building decision context for first pending request...');
      const decisionContext = await financialService.buildDecisionContext(pendingRequests[0].id);
      logger.info('Decision context built', {
        requestAmount: decisionContext.request.amount,
        shouldApprove: decisionContext.recommendation.shouldApprove,
        confidence: decisionContext.recommendation.confidence,
        financialHealthScore: decisionContext.financialHealth.score,
        budgetRemaining: decisionContext.budgetContext.remainingBudget,
      });
    }

    // Example 7: Get service metrics
    const metrics = financialService.getServiceMetrics();
    logger.info('Service metrics', {
      uptime: metrics.uptime,
      notionSuccessRate: metrics.notionClient.successRate,
      totalRequests: metrics.notionClient.totalRequests,
      cacheSize: financialService.getCacheStats().notionClient.size,
    });

    logger.info('Example usage completed successfully');

  } catch (error) {
    logger.error('Example usage failed', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
  }
}

// Example of error handling
async function errorHandlingExample() {
  try {
    // Example with invalid configuration
    const invalidConfig: NotionFinancialServiceConfig = {
      token: '', // Invalid empty token
      spendingDatabase: '', // Invalid empty database ID
    };

    await createNotionFinancialService(invalidConfig);
  } catch (error) {
    logger.info('Caught expected error for invalid configuration', {
      errorName: (error as Error).name,
      errorCode: (error as any).code,
    });
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  Promise.all([
    exampleUsage(),
    errorHandlingExample(),
  ]).then(() => {
    logger.info('All examples completed');
    process.exit(0);
  }).catch((error) => {
    logger.error('Examples failed', { error: error.message });
    process.exit(1);
  });
}