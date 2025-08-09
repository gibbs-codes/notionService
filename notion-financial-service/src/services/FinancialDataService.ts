import { logger } from '../config/logger';
import { NotionClient } from './NotionClient';
import { FilterBuilder, SortBuilder } from './FilterBuilder';
import {
  FinancialGoal,
  DebtInfo,
  AccountBalance,
  FinancialContext,
  BudgetStatus,
  NotionPageBase,
  calculateNetWorth,
  calculateTotalAssets,
  calculateTotalLiabilities,
} from '../types';
import { z } from 'zod';
import dayjs from 'dayjs';

export interface FinancialDataServiceConfig {
  goalsDatabase?: string;
  debtsDatabase?: string;
  accountsDatabase?: string;
  defaultMonthlyBudget?: number;
}

export class FinancialDataServiceError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any,
  ) {
    super(message);
    this.name = 'FinancialDataServiceError';
  }
}

// Input validation schemas
const BuildFinancialContextSchema = z.object({
  includeGoals: z.boolean().default(true),
  includeDebts: z.boolean().default(true),
  includeAccounts: z.boolean().default(true),
  spendingDays: z.number().int().min(1).max(365).default(30),
});

const MonthlyBudgetSchema = z.object({
  budget: z.number().positive('Monthly budget must be positive'),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format').optional(),
});

export class FinancialDataService {
  private notion: NotionClient;
  private config: FinancialDataServiceConfig;
  private lastOperationTime?: Date;
  private errorCount = 0;
  private totalOperations = 0;

  constructor(notionClient: NotionClient, config: FinancialDataServiceConfig = {}) {
    this.notion = notionClient;
    this.config = {
      defaultMonthlyBudget: 3000,
      ...config,
    };

    logger.info('FinancialDataService initialized', {
      goalsDatabase: this.config.goalsDatabase,
      debtsDatabase: this.config.debtsDatabase,
      accountsDatabase: this.config.accountsDatabase,
      defaultBudget: this.config.defaultMonthlyBudget,
    });
  }

  private trackOperation(success: boolean): void {
    this.lastOperationTime = new Date();
    this.totalOperations++;
    if (!success) {
      this.errorCount++;
    }
  }

  private parseFinancialGoalFromPage(page: NotionPageBase): FinancialGoal | null {
    try {
      const rawData = {
        id: page.id,
        title: this.notion.extractTitle(page.properties['Title']) || 
               this.notion.extractText(page.properties['Title']),
        targetAmount: this.notion.extractNumber(page.properties['Target Amount']),
        currentAmount: this.notion.extractNumber(page.properties['Current Amount']) || 0,
        deadline: this.notion.extractDate(page.properties['Deadline']),
        priority: this.notion.extractSelect(page.properties['Priority']),
        category: this.notion.extractSelect(page.properties['Category']),
        status: this.notion.extractSelect(page.properties['Status']),
        description: this.notion.extractText(page.properties['Description']),
        createdDate: this.notion.extractDate(page.properties['Created Date']) || 
                     new Date(page.created_time),
        completedDate: this.notion.extractDate(page.properties['Completed Date']),
      };

      // Validate required fields
      if (!rawData.title || rawData.targetAmount === null || !rawData.priority || 
          !rawData.category || !rawData.status) {
        logger.warn('Incomplete financial goal data', {
          pageId: page.id,
          missing: {
            title: !rawData.title,
            targetAmount: rawData.targetAmount === null,
            priority: !rawData.priority,
            category: !rawData.category,
            status: !rawData.status,
          },
        });
        return null;
      }

      return {
        ...rawData,
        targetAmount: rawData.targetAmount!,
        description: rawData.description || undefined,
        deadline: rawData.deadline || undefined,
        completedDate: rawData.completedDate || undefined,
      };
    } catch (error) {
      logger.error('Failed to parse financial goal from Notion page', {
        pageId: page.id,
        error: (error as Error).message,
      });
      return null;
    }
  }

  private parseDebtInfoFromPage(page: NotionPageBase): DebtInfo | null {
    try {
      const rawData = {
        id: page.id,
        creditor: this.notion.extractTitle(page.properties['Creditor']) || 
                  this.notion.extractText(page.properties['Creditor']),
        totalAmount: this.notion.extractNumber(page.properties['Total Amount']),
        remainingAmount: this.notion.extractNumber(page.properties['Remaining Amount']),
        minimumPayment: this.notion.extractNumber(page.properties['Minimum Payment']),
        interestRate: this.notion.extractNumber(page.properties['Interest Rate']),
        dueDate: this.notion.extractDate(page.properties['Due Date']),
        priority: this.notion.extractSelect(page.properties['Priority']),
        debtType: this.notion.extractSelect(page.properties['Debt Type']),
        status: this.notion.extractSelect(page.properties['Status']),
        description: this.notion.extractText(page.properties['Description']),
        createdDate: this.notion.extractDate(page.properties['Created Date']) || 
                     new Date(page.created_time),
        lastPaymentDate: this.notion.extractDate(page.properties['Last Payment Date']),
        paidOffDate: this.notion.extractDate(page.properties['Paid Off Date']),
      };

      // Validate required fields
      if (!rawData.creditor || rawData.totalAmount === null || 
          rawData.remainingAmount === null || rawData.minimumPayment === null ||
          rawData.interestRate === null || !rawData.dueDate || !rawData.priority ||
          !rawData.debtType || !rawData.status) {
        logger.warn('Incomplete debt info data', {
          pageId: page.id,
          missing: {
            creditor: !rawData.creditor,
            totalAmount: rawData.totalAmount === null,
            remainingAmount: rawData.remainingAmount === null,
            minimumPayment: rawData.minimumPayment === null,
            interestRate: rawData.interestRate === null,
            dueDate: !rawData.dueDate,
            priority: !rawData.priority,
            debtType: !rawData.debtType,
            status: !rawData.status,
          },
        });
        return null;
      }

      return {
        ...rawData,
        totalAmount: rawData.totalAmount!,
        remainingAmount: rawData.remainingAmount!,
        minimumPayment: rawData.minimumPayment!,
        interestRate: rawData.interestRate!,
        dueDate: rawData.dueDate!,
        description: rawData.description || undefined,
        lastPaymentDate: rawData.lastPaymentDate || undefined,
        paidOffDate: rawData.paidOffDate || undefined,
      };
    } catch (error) {
      logger.error('Failed to parse debt info from Notion page', {
        pageId: page.id,
        error: (error as Error).message,
      });
      return null;
    }
  }

  private parseAccountBalanceFromPage(page: NotionPageBase): AccountBalance | null {
    try {
      const rawData = {
        id: page.id,
        accountName: this.notion.extractTitle(page.properties['Account Name']) || 
                     this.notion.extractText(page.properties['Account Name']),
        accountType: this.notion.extractSelect(page.properties['Account Type']),
        currentBalance: this.notion.extractNumber(page.properties['Current Balance']),
        availableBalance: this.notion.extractNumber(page.properties['Available Balance']),
        lastUpdated: this.notion.extractDate(page.properties['Last Updated']) || 
                     new Date(page.last_edited_time),
        status: this.notion.extractSelect(page.properties['Status']),
        institution: this.notion.extractText(page.properties['Institution']),
        accountNumber: this.notion.extractText(page.properties['Account Number']),
        interestRate: this.notion.extractNumber(page.properties['Interest Rate']),
        minimumBalance: this.notion.extractNumber(page.properties['Minimum Balance']),
        creditLimit: this.notion.extractNumber(page.properties['Credit Limit']),
        description: this.notion.extractText(page.properties['Description']),
      };

      // Validate required fields
      if (!rawData.accountName || !rawData.accountType || 
          rawData.currentBalance === null || rawData.availableBalance === null ||
          !rawData.status) {
        logger.warn('Incomplete account balance data', {
          pageId: page.id,
          missing: {
            accountName: !rawData.accountName,
            accountType: !rawData.accountType,
            currentBalance: rawData.currentBalance === null,
            availableBalance: rawData.availableBalance === null,
            status: !rawData.status,
          },
        });
        return null;
      }

      return {
        ...rawData,
        currentBalance: rawData.currentBalance!,
        availableBalance: rawData.availableBalance!,
        institution: rawData.institution || undefined,
        accountNumber: rawData.accountNumber || undefined,
        interestRate: rawData.interestRate || undefined,
        minimumBalance: rawData.minimumBalance || undefined,
        creditLimit: rawData.creditLimit || undefined,
        description: rawData.description || undefined,
      };
    } catch (error) {
      logger.error('Failed to parse account balance from Notion page', {
        pageId: page.id,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Get all active financial goals
   */
  async getActiveGoals(): Promise<FinancialGoal[]> {
    try {
      if (!this.config.goalsDatabase) {
        logger.warn('Goals database not configured');
        this.trackOperation(true);
        return [];
      }

      logger.info('Fetching active financial goals', {
        databaseId: this.config.goalsDatabase,
      });

      const filter = new FilterBuilder()
        .selectEquals('Status', 'active')
        .build();

      const sorts = new SortBuilder()
        .descending('Priority')
        .ascending('Deadline')
        .build();

      const pages = await this.notion.queryDatabase(this.config.goalsDatabase, filter, sorts);

      const goals = pages
        .map(page => this.parseFinancialGoalFromPage(page))
        .filter((goal): goal is FinancialGoal => goal !== null);

      logger.info('Successfully fetched active financial goals', {
        totalFound: goals.length,
        totalTargetAmount: goals.reduce((sum, goal) => sum + goal.targetAmount, 0),
        totalCurrentAmount: goals.reduce((sum, goal) => sum + goal.currentAmount, 0),
      });

      this.trackOperation(true);
      return goals;
    } catch (error) {
      this.trackOperation(false);
      logger.error('Failed to fetch active financial goals', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        goalsDatabase: this.config.goalsDatabase,
      });
      
      throw new FinancialDataServiceError(
        'Failed to fetch active financial goals',
        'FETCH_GOALS_ERROR',
        { originalError: error },
      );
    }
  }

  /**
   * Get all debts (excluding paid off ones)
   */
  async getAllDebts(): Promise<DebtInfo[]> {
    try {
      if (!this.config.debtsDatabase) {
        logger.warn('Debts database not configured');
        this.trackOperation(true);
        return [];
      }

      logger.info('Fetching all active debts', {
        databaseId: this.config.debtsDatabase,
      });

      const filter = new FilterBuilder()
        .selectEquals('Status', 'active')
        .numberGreaterThan('Remaining Amount', 0)
        .build();

      const sorts = new SortBuilder()
        .descending('Priority')
        .descending('Interest Rate')
        .ascending('Due Date')
        .build();

      const pages = await this.notion.queryDatabase(this.config.debtsDatabase, filter, sorts);

      const debts = pages
        .map(page => this.parseDebtInfoFromPage(page))
        .filter((debt): debt is DebtInfo => debt !== null);

      logger.info('Successfully fetched all debts', {
        totalFound: debts.length,
        totalDebt: debts.reduce((sum, debt) => sum + debt.remainingAmount, 0),
        totalMinimumPayments: debts.reduce((sum, debt) => sum + debt.minimumPayment, 0),
        highPriorityCount: debts.filter(debt => ['high', 'urgent'].includes(debt.priority)).length,
      });

      this.trackOperation(true);
      return debts;
    } catch (error) {
      this.trackOperation(false);
      logger.error('Failed to fetch all debts', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        debtsDatabase: this.config.debtsDatabase,
      });
      
      throw new FinancialDataServiceError(
        'Failed to fetch all debts',
        'FETCH_DEBTS_ERROR',
        { originalError: error },
      );
    }
  }

  /**
   * Get current account balances
   */
  async getAccountBalances(): Promise<AccountBalance[]> {
    try {
      if (!this.config.accountsDatabase) {
        logger.warn('Accounts database not configured');
        this.trackOperation(true);
        return [];
      }

      logger.info('Fetching account balances', {
        databaseId: this.config.accountsDatabase,
      });

      const filter = new FilterBuilder()
        .selectEquals('Status', 'active')
        .build();

      const sorts = new SortBuilder()
        .descending('Current Balance')
        .ascending('Account Type')
        .build();

      const pages = await this.notion.queryDatabase(this.config.accountsDatabase, filter, sorts);

      const accounts = pages
        .map(page => this.parseAccountBalanceFromPage(page))
        .filter((account): account is AccountBalance => account !== null);

      const netWorth = calculateNetWorth(accounts);
      const totalAssets = calculateTotalAssets(accounts);
      const totalLiabilities = calculateTotalLiabilities(accounts);

      logger.info('Successfully fetched account balances', {
        totalFound: accounts.length,
        netWorth,
        totalAssets,
        totalLiabilities,
        accountTypes: [...new Set(accounts.map(a => a.accountType))],
      });

      this.trackOperation(true);
      return accounts;
    } catch (error) {
      this.trackOperation(false);
      logger.error('Failed to fetch account balances', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        accountsDatabase: this.config.accountsDatabase,
      });
      
      throw new FinancialDataServiceError(
        'Failed to fetch account balances',
        'FETCH_ACCOUNTS_ERROR',
        { originalError: error },
      );
    }
  }

  /**
   * Build comprehensive financial context
   */
  async buildFinancialContext(options: {
    includeGoals?: boolean;
    includeDebts?: boolean;
    includeAccounts?: boolean;
    spendingDays?: number;
  } = {}): Promise<FinancialContext> {
    try {
      // Validate input
      const validatedOptions = BuildFinancialContextSchema.parse(options);

      logger.info('Building financial context', {
        includeGoals: validatedOptions.includeGoals,
        includeDebts: validatedOptions.includeDebts,
        includeAccounts: validatedOptions.includeAccounts,
        spendingDays: validatedOptions.spendingDays,
      });

      // Fetch all data in parallel where possible
      const promises: Promise<any>[] = [];
      
      if (validatedOptions.includeGoals) {
        promises.push(this.getActiveGoals().catch(error => {
          logger.warn('Failed to fetch goals for context', { error: error.message });
          return [];
        }));
      } else {
        promises.push(Promise.resolve([]));
      }

      if (validatedOptions.includeDebts) {
        promises.push(this.getAllDebts().catch(error => {
          logger.warn('Failed to fetch debts for context', { error: error.message });
          return [];
        }));
      } else {
        promises.push(Promise.resolve([]));
      }

      if (validatedOptions.includeAccounts) {
        promises.push(this.getAccountBalances().catch(error => {
          logger.warn('Failed to fetch accounts for context', { error: error.message });
          return [];
        }));
      } else {
        promises.push(Promise.resolve([]));
      }

      const [goals, debts, accounts] = await Promise.all(promises);

      // Calculate financial metrics
      const netWorth = accounts.length > 0 ? calculateNetWorth(accounts) : 0;
      const totalDebt = debts.reduce((sum: number, debt: DebtInfo) => sum + debt.remainingAmount, 0);
      const monthlyDebtPayments = debts.reduce((sum: number, debt: DebtInfo) => sum + debt.minimumPayment, 0);
      
      // Available funds calculation (simplified)
      const availableFunds = await this.calculateAvailableFunds();

      const context: FinancialContext = {
        recentSpending: [], // This would be populated by SpendingRequestService
        monthlyTotal: 0,   // This would be populated by SpendingRequestService
        weeklyTotal: 0,    // This would be populated by SpendingRequestService
        averageRequestAmount: 0, // This would be populated by SpendingRequestService
        categoryBreakdown: {} as any, // This would be populated by SpendingRequestService
        urgentRequestsCount: 0, // This would be populated by SpendingRequestService
        availableFunds,
        monthlyBudget: this.config.defaultMonthlyBudget,
      };

      logger.info('Successfully built financial context', {
        goalsCount: goals.length,
        debtsCount: debts.length,
        accountsCount: accounts.length,
        netWorth,
        totalDebt,
        monthlyDebtPayments,
        availableFunds,
      });

      this.trackOperation(true);
      return context;
    } catch (error) {
      this.trackOperation(false);
      if (error instanceof z.ZodError) {
        logger.error('Invalid input for buildFinancialContext', {
          validationErrors: error.errors,
        });
        throw new FinancialDataServiceError(
          'Invalid input parameters',
          'VALIDATION_ERROR',
          { validationErrors: error.errors },
        );
      }

      logger.error('Failed to build financial context', {
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      
      throw new FinancialDataServiceError(
        'Failed to build financial context',
        'BUILD_CONTEXT_ERROR',
        { originalError: error },
      );
    }
  }

  /**
   * Calculate available funds for spending
   */
  async calculateAvailableFunds(): Promise<number> {
    try {
      logger.info('Calculating available funds');

      const accounts = await this.getAccountBalances();
      
      // Calculate liquid assets (checking, savings, money market)
      const liquidAccounts = accounts.filter(account => 
        ['checking', 'savings', 'money_market'].includes(account.accountType)
      );

      const totalLiquid = liquidAccounts.reduce((sum, account) => 
        sum + account.availableBalance, 0
      );

      // Subtract emergency fund requirement (3 months of expenses, estimated)
      const emergencyFundRequired = (this.config.defaultMonthlyBudget || 3000) * 3;
      const availableForSpending = Math.max(totalLiquid - emergencyFundRequired, 0);

      logger.info('Available funds calculated', {
        totalLiquidAssets: totalLiquid,
        emergencyFundRequired,
        availableForSpending,
        liquidAccountsCount: liquidAccounts.length,
      });

      this.trackOperation(true);
      return availableForSpending;
    } catch (error) {
      this.trackOperation(false);
      logger.error('Failed to calculate available funds', {
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      
      throw new FinancialDataServiceError(
        'Failed to calculate available funds',
        'CALCULATE_FUNDS_ERROR',
        { originalError: error },
      );
    }
  }

  /**
   * Get monthly budget status and tracking
   */
  async getMonthlyBudgetStatus(monthlyBudget?: number, month?: string): Promise<BudgetStatus> {
    try {
      // Validate input
      const validatedInput = MonthlyBudgetSchema.parse({
        budget: monthlyBudget || this.config.defaultMonthlyBudget || 3000,
        month,
      });

      const targetMonth = month ? dayjs(month + '-01') : dayjs();
      const monthStart = targetMonth.startOf('month');
      const monthEnd = targetMonth.endOf('month');
      const now = dayjs();
      
      logger.info('Getting monthly budget status', {
        budget: validatedInput.budget,
        month: targetMonth.format('YYYY-MM'),
        isCurrentMonth: targetMonth.isSame(now, 'month'),
      });

      // For now, return a basic budget status
      // In a real implementation, this would integrate with SpendingRequestService
      const daysInMonth = monthEnd.date();
      const daysIntoMonth = now.date();
      const daysRemainingInMonth = daysInMonth - daysIntoMonth;

      // Placeholder values - would be calculated from actual spending data
      const currentSpending = 0;
      const remainingBudget = validatedInput.budget - currentSpending;
      const percentageUsed = (currentSpending / validatedInput.budget) * 100;
      const dailyAverageSpent = daysIntoMonth > 0 ? currentSpending / daysIntoMonth : 0;
      const projectedMonthlySpending = dailyAverageSpent * daysInMonth;
      const isOnTrack = projectedMonthlySpending <= validatedInput.budget * 1.05; // 5% tolerance

      let budgetHealth: 'excellent' | 'good' | 'warning' | 'critical';
      const recommendations: string[] = [];

      if (percentageUsed < 50) {
        budgetHealth = 'excellent';
        recommendations.push('Budget is well under control');
      } else if (percentageUsed < 75) {
        budgetHealth = 'good';
        recommendations.push('Budget tracking is healthy');
      } else if (percentageUsed < 90) {
        budgetHealth = 'warning';
        recommendations.push('Monitor spending closely for rest of month');
      } else {
        budgetHealth = 'critical';
        recommendations.push('Budget limit nearly reached - restrict non-essential spending');
      }

      const budgetStatus: BudgetStatus = {
        monthlyBudget: validatedInput.budget,
        currentSpending,
        remainingBudget,
        percentageUsed,
        daysIntoMonth,
        daysRemainingInMonth,
        dailyAverageSpent,
        projectedMonthlySpending,
        isOnTrack,
        budgetHealth,
        recommendations,
      };

      logger.info('Monthly budget status calculated', {
        budget: validatedInput.budget,
        percentageUsed: Math.round(percentageUsed * 100) / 100,
        budgetHealth,
        isOnTrack,
      });

      this.trackOperation(true);
      return budgetStatus;
    } catch (error) {
      this.trackOperation(false);
      if (error instanceof z.ZodError) {
        logger.error('Invalid input for getMonthlyBudgetStatus', {
          validationErrors: error.errors,
        });
        throw new FinancialDataServiceError(
          'Invalid input parameters',
          'VALIDATION_ERROR',
          { validationErrors: error.errors },
        );
      }

      logger.error('Failed to get monthly budget status', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        monthlyBudget,
        month,
      });
      
      throw new FinancialDataServiceError(
        'Failed to get monthly budget status',
        'BUDGET_STATUS_ERROR',
        { originalError: error },
      );
    }
  }

  /**
   * Get service health and performance metrics
   */
  getServiceMetrics(): {
    lastOperationTime?: Date;
    errorRate: number;
    totalOperations: number;
    configuredDatabases: {
      goals: boolean;
      debts: boolean;
      accounts: boolean;
    };
  } {
    const errorRate = this.totalOperations > 0 ? (this.errorCount / this.totalOperations) * 100 : 0;

    return {
      lastOperationTime: this.lastOperationTime,
      errorRate,
      totalOperations: this.totalOperations,
      configuredDatabases: {
        goals: !!this.config.goalsDatabase,
        debts: !!this.config.debtsDatabase,
        accounts: !!this.config.accountsDatabase,
      },
    };
  }
}