import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../config/logger';
import { NotionFinancialService } from '../../services';
import { HttpStatus } from '../schemas';
import { createSuccessResponse } from '../middleware';

export async function financialRoutes(
  fastify: FastifyInstance,
  options: { financialService: NotionFinancialService }
) {
  const { financialService } = options;

  // GET /api/financial/context - Get complete financial picture
  fastify.get('/api/financial/context', {
    schema: {
      description: 'Get comprehensive financial context including net worth, goals, debts, and budget',
      tags: ['financial'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                netWorth: { type: 'number' },
                totalAssets: { type: 'number' },
                totalLiabilities: { type: 'number' },
                goals: { type: 'object' },
                debts: { type: 'object' },
                budget: { type: 'object' },
                cashFlow: { type: 'object' },
              },
            },
            timestamp: { type: 'string' },
            requestId: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = (request as any).requestId;

    try {
      logger.info('Building comprehensive financial context', { requestId });

      // Fetch all financial data in parallel
      const [goals, debts, accounts, budgetStatus] = await Promise.all([
        financialService.getActiveGoals().catch(() => []),
        financialService.getAllDebts().catch(() => []),
        financialService.getAccountBalances().catch(() => []),
        financialService.getBudgetStatus().catch(() => ({
          monthlyBudget: 0,
          currentSpending: 0,
          remainingBudget: 0,
          percentageUsed: 0,
          daysIntoMonth: 0,
          daysRemainingInMonth: 0,
          dailyAverageSpent: 0,
          projectedMonthlySpending: 0,
          isOnTrack: true,
          budgetHealth: 'excellent' as const,
          recommendations: [],
        })),
      ]);

      // Calculate financial metrics
      const totalAssets = accounts.reduce((sum, account) => sum + account.balance, 0);
      const totalLiabilities = debts.reduce((sum, debt) => sum + debt.remainingAmount, 0);
      const netWorth = totalAssets - totalLiabilities;

      // Goals analysis
      const activeGoals = goals.filter(g => g.status === 'active');
      const completedGoals = goals.filter(g => g.status === 'completed');
      const totalGoalTargetAmount = activeGoals.reduce((sum, goal) => sum + goal.targetAmount, 0);
      const totalGoalProgress = activeGoals.reduce((sum, goal) => sum + goal.currentAmount, 0);
      const goalCompletionRate = goals.length > 0 
        ? Math.round((completedGoals.length / goals.length) * 100) 
        : 0;

      // Debts analysis
      const activeDebts = debts.filter(d => d.status === 'active');
      const highPriorityDebts = activeDebts.filter(d => ['high', 'urgent'].includes(d.priority));
      const totalMonthlyDebtPayments = activeDebts.reduce((sum, debt) => sum + debt.minimumPayment, 0);
      const averageInterestRate = activeDebts.length > 0
        ? activeDebts.reduce((sum, debt) => sum + (debt.interestRate || 0), 0) / activeDebts.length
        : 0;

      // Cash flow analysis
      const availableFunds = await financialService.calculateAvailableFunds().catch(() => 0);
      const projectedEndOfMonth = budgetStatus.remainingBudget - 
        (budgetStatus.dailyAverageSpent * budgetStatus.daysRemainingInMonth);
      const recommendedSavings = Math.max(0, budgetStatus.remainingBudget * 0.2); // 20% of remaining budget

      const responseData = {
        netWorth: Math.round(netWorth * 100) / 100,
        totalAssets: Math.round(totalAssets * 100) / 100,
        totalLiabilities: Math.round(totalLiabilities * 100) / 100,
        goals: {
          active: activeGoals.length,
          completed: completedGoals.length,
          totalTargetAmount: Math.round(totalGoalTargetAmount * 100) / 100,
          totalProgress: Math.round(totalGoalProgress * 100) / 100,
          completionRate: goalCompletionRate,
        },
        debts: {
          count: activeDebts.length,
          totalAmount: Math.round(totalLiabilities * 100) / 100,
          monthlyPayments: Math.round(totalMonthlyDebtPayments * 100) / 100,
          highPriorityCount: highPriorityDebts.length,
          ...(averageInterestRate > 0 && { 
            averageInterestRate: Math.round(averageInterestRate * 100) / 100 
          }),
        },
        budget: {
          monthlyBudget: budgetStatus.monthlyBudget,
          currentSpending: budgetStatus.currentSpending,
          remainingBudget: budgetStatus.remainingBudget,
          percentageUsed: budgetStatus.percentageUsed,
          status: budgetStatus.budgetHealth,
          ...(projectedEndOfMonth < 0 && { 
            projectedOverage: Math.abs(projectedEndOfMonth) 
          }),
        },
        cashFlow: {
          availableFunds: Math.round(availableFunds * 100) / 100,
          projectedEndOfMonth: Math.round(projectedEndOfMonth * 100) / 100,
          recommendedSavings: Math.round(recommendedSavings * 100) / 100,
        },
      };

      logger.info('Successfully built financial context', {
        requestId,
        netWorth: responseData.netWorth,
        activeGoals: responseData.goals.active,
        activeDebts: responseData.debts.count,
        budgetStatus: responseData.budget.status,
      });

      return reply.status(HttpStatus.OK).send(
        createSuccessResponse(
          responseData,
          'Financial context retrieved successfully',
          requestId
        )
      );
    } catch (error) {
      logger.error('Failed to build financial context', {
        requestId,
        error: (error as Error).message,
      });
      throw error;
    }
  });

  // GET /api/financial/goals - Get active financial goals
  fastify.get('/api/financial/goals', {
    schema: {
      description: 'Get all active financial goals with progress tracking',
      tags: ['financial'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  category: { type: 'string' },
                  targetAmount: { type: 'number' },
                  currentAmount: { type: 'number' },
                  targetDate: { type: 'string' },
                  priority: { type: 'string' },
                  status: { type: 'string' },
                  progressPercentage: { type: 'number' },
                  remainingAmount: { type: 'number' },
                  monthsRemaining: { type: 'number' },
                  monthlyTarget: { type: 'number' },
                },
              },
            },
            summary: {
              type: 'object',
              properties: {
                totalGoals: { type: 'number' },
                totalTargetAmount: { type: 'number' },
                totalProgress: { type: 'number' },
                averageProgress: { type: 'number' },
              },
            },
            timestamp: { type: 'string' },
            requestId: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = (request as any).requestId;

    try {
      logger.info('Fetching financial goals', { requestId });

      const goals = await financialService.getActiveGoals();
      
      // Transform goals data with calculated metrics
      const responseData = goals.map(goal => {
        const progressPercentage = goal.targetAmount > 0 
          ? Math.round((goal.currentAmount / goal.targetAmount) * 100)
          : 0;
        const remainingAmount = Math.max(0, goal.targetAmount - goal.currentAmount);
        
        // Calculate months remaining
        const now = new Date();
        const targetDate = new Date(goal.targetDate);
        const monthsRemaining = Math.max(0, Math.ceil(
          (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)
        ));
        
        // Calculate monthly target needed
        const monthlyTarget = monthsRemaining > 0 ? remainingAmount / monthsRemaining : 0;

        return {
          id: goal.id,
          title: goal.title,
          description: goal.description,
          category: goal.category,
          targetAmount: goal.targetAmount,
          currentAmount: goal.currentAmount,
          targetDate: goal.targetDate.toISOString(),
          priority: goal.priority,
          status: goal.status,
          progressPercentage,
          remainingAmount: Math.round(remainingAmount * 100) / 100,
          monthsRemaining,
          monthlyTarget: Math.round(monthlyTarget * 100) / 100,
        };
      });

      // Calculate summary statistics
      const totalTargetAmount = responseData.reduce((sum, goal) => sum + goal.targetAmount, 0);
      const totalProgress = responseData.reduce((sum, goal) => sum + goal.currentAmount, 0);
      const averageProgress = responseData.length > 0
        ? Math.round((responseData.reduce((sum, goal) => sum + goal.progressPercentage, 0) / responseData.length))
        : 0;

      const summary = {
        totalGoals: responseData.length,
        totalTargetAmount: Math.round(totalTargetAmount * 100) / 100,
        totalProgress: Math.round(totalProgress * 100) / 100,
        averageProgress,
      };

      logger.info('Successfully fetched financial goals', {
        requestId,
        totalGoals: responseData.length,
        totalTargetAmount,
        averageProgress,
      });

      return reply.status(HttpStatus.OK).send(
        createSuccessResponse(
          responseData,
          `Retrieved ${responseData.length} financial goals`,
          requestId,
        )
      );
    } catch (error) {
      logger.error('Failed to fetch financial goals', {
        requestId,
        error: (error as Error).message,
      });
      throw error;
    }
  });

  // GET /api/financial/debts - Get debt information
  fastify.get('/api/financial/debts', {
    schema: {
      description: 'Get all debt information with payment tracking',
      tags: ['financial'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  creditor: { type: 'string' },
                  type: { type: 'string' },
                  originalAmount: { type: 'number' },
                  remainingAmount: { type: 'number' },
                  interestRate: { type: 'number' },
                  minimumPayment: { type: 'number' },
                  dueDate: { type: 'string' },
                  priority: { type: 'string' },
                  status: { type: 'string' },
                  progressPercentage: { type: 'number' },
                  monthsToPayoff: { type: 'number' },
                },
              },
            },
            summary: {
              type: 'object',
              properties: {
                totalDebts: { type: 'number' },
                totalAmount: { type: 'number' },
                totalMonthlyPayments: { type: 'number' },
                highPriorityCount: { type: 'number' },
                averageInterestRate: { type: 'number' },
              },
            },
            timestamp: { type: 'string' },
            requestId: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = (request as any).requestId;

    try {
      logger.info('Fetching debt information', { requestId });

      const debts = await financialService.getAllDebts();
      
      // Transform debts data with calculated metrics
      const responseData = debts.map(debt => {
        const progressPercentage = debt.originalAmount > 0 
          ? Math.round(((debt.originalAmount - debt.remainingAmount) / debt.originalAmount) * 100)
          : 0;
        
        // Calculate months to payoff (simplified calculation)
        const monthsToPayoff = debt.minimumPayment > 0 && debt.interestRate !== undefined
          ? Math.ceil(debt.remainingAmount / debt.minimumPayment)
          : 0;

        return {
          id: debt.id,
          creditor: debt.creditor,
          type: debt.type,
          originalAmount: debt.originalAmount,
          remainingAmount: debt.remainingAmount,
          interestRate: debt.interestRate,
          minimumPayment: debt.minimumPayment,
          dueDate: debt.dueDate ? debt.dueDate.toISOString() : undefined,
          priority: debt.priority,
          status: debt.status,
          progressPercentage,
          monthsToPayoff,
        };
      });

      // Calculate summary statistics
      const activeDebts = responseData.filter(debt => debt.status === 'active');
      const totalAmount = activeDebts.reduce((sum, debt) => sum + debt.remainingAmount, 0);
      const totalMonthlyPayments = activeDebts.reduce((sum, debt) => sum + debt.minimumPayment, 0);
      const highPriorityCount = activeDebts.filter(debt => ['high', 'urgent'].includes(debt.priority)).length;
      const averageInterestRate = activeDebts.length > 0
        ? activeDebts.reduce((sum, debt) => sum + (debt.interestRate || 0), 0) / activeDebts.length
        : 0;

      const summary = {
        totalDebts: activeDebts.length,
        totalAmount: Math.round(totalAmount * 100) / 100,
        totalMonthlyPayments: Math.round(totalMonthlyPayments * 100) / 100,
        highPriorityCount,
        averageInterestRate: Math.round(averageInterestRate * 100) / 100,
      };

      logger.info('Successfully fetched debt information', {
        requestId,
        totalDebts: responseData.length,
        totalAmount: summary.totalAmount,
        highPriorityCount: summary.highPriorityCount,
      });

      return reply.status(HttpStatus.OK).send(
        createSuccessResponse(
          responseData,
          `Retrieved ${responseData.length} debt records`,
          requestId,
        )
      );
    } catch (error) {
      logger.error('Failed to fetch debt information', {
        requestId,
        error: (error as Error).message,
      });
      throw error;
    }
  });

  // GET /api/financial/accounts - Get account balances
  fastify.get('/api/financial/accounts', {
    schema: {
      description: 'Get all account balances and financial positions',
      tags: ['financial'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  accountName: { type: 'string' },
                  accountType: { type: 'string' },
                  balance: { type: 'number' },
                  currency: { type: 'string' },
                  lastUpdated: { type: 'string' },
                  institution: { type: 'string' },
                  isActive: { type: 'boolean' },
                },
              },
            },
            summary: {
              type: 'object',
              properties: {
                totalAccounts: { type: 'number' },
                totalBalance: { type: 'number' },
                byType: { type: 'object' },
                lastUpdated: { type: 'string' },
              },
            },
            timestamp: { type: 'string' },
            requestId: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = (request as any).requestId;

    try {
      logger.info('Fetching account balances', { requestId });

      const accounts = await financialService.getAccountBalances();
      
      // Transform accounts data
      const responseData = accounts.map(account => ({
        id: account.id,
        accountName: account.accountName,
        accountType: account.accountType,
        balance: Math.round(account.balance * 100) / 100,
        currency: account.currency || 'USD',
        lastUpdated: account.lastUpdated ? account.lastUpdated.toISOString() : new Date().toISOString(),
        institution: account.institution,
        isActive: account.isActive ?? true,
      }));

      // Calculate summary statistics
      const activeAccounts = responseData.filter(account => account.isActive);
      const totalBalance = activeAccounts.reduce((sum, account) => sum + account.balance, 0);
      
      // Group by account type
      const byType = activeAccounts.reduce((acc, account) => {
        if (!acc[account.accountType]) {
          acc[account.accountType] = { count: 0, balance: 0 };
        }
        acc[account.accountType].count++;
        acc[account.accountType].balance += account.balance;
        return acc;
      }, {} as Record<string, { count: number; balance: number }>);

      // Round balances in byType
      Object.values(byType).forEach(type => {
        type.balance = Math.round(type.balance * 100) / 100;
      });

      const latestUpdate = responseData.reduce((latest, account) => {
        const accountDate = new Date(account.lastUpdated);
        return accountDate > latest ? accountDate : latest;
      }, new Date(0));

      const summary = {
        totalAccounts: activeAccounts.length,
        totalBalance: Math.round(totalBalance * 100) / 100,
        byType,
        lastUpdated: latestUpdate.toISOString(),
      };

      logger.info('Successfully fetched account balances', {
        requestId,
        totalAccounts: responseData.length,
        totalBalance: summary.totalBalance,
        accountTypes: Object.keys(byType).length,
      });

      return reply.status(HttpStatus.OK).send(
        createSuccessResponse(
          responseData,
          `Retrieved ${responseData.length} account balances`,
          requestId,
        )
      );
    } catch (error) {
      logger.error('Failed to fetch account balances', {
        requestId,
        error: (error as Error).message,
      });
      throw error;
    }
  });

  // GET /api/financial/budget - Get budget status
  fastify.get('/api/financial/budget', {
    schema: {
      description: 'Get current month budget status and recommendations',
      tags: ['financial'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                monthlyBudget: { type: 'number' },
                currentSpending: { type: 'number' },
                remainingBudget: { type: 'number' },
                percentageUsed: { type: 'number' },
                daysIntoMonth: { type: 'number' },
                daysRemainingInMonth: { type: 'number' },
                dailyAverageSpent: { type: 'number' },
                projectedMonthlySpending: { type: 'number' },
                isOnTrack: { type: 'boolean' },
                budgetHealth: { type: 'string' },
                recommendations: { type: 'array', items: { type: 'string' } },
              },
            },
            timestamp: { type: 'string' },
            requestId: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = (request as any).requestId;

    try {
      logger.info('Fetching budget status', { requestId });

      const budgetStatus = await financialService.getBudgetStatus();

      const responseData = {
        monthlyBudget: budgetStatus.monthlyBudget,
        currentSpending: Math.round(budgetStatus.currentSpending * 100) / 100,
        remainingBudget: Math.round(budgetStatus.remainingBudget * 100) / 100,
        percentageUsed: Math.round(budgetStatus.percentageUsed * 100) / 100,
        daysIntoMonth: budgetStatus.daysIntoMonth,
        daysRemainingInMonth: budgetStatus.daysRemainingInMonth,
        dailyAverageSpent: Math.round(budgetStatus.dailyAverageSpent * 100) / 100,
        projectedMonthlySpending: Math.round(budgetStatus.projectedMonthlySpending * 100) / 100,
        isOnTrack: budgetStatus.isOnTrack,
        budgetHealth: budgetStatus.budgetHealth,
        recommendations: budgetStatus.recommendations,
      };

      logger.info('Successfully fetched budget status', {
        requestId,
        percentageUsed: responseData.percentageUsed,
        budgetHealth: responseData.budgetHealth,
        isOnTrack: responseData.isOnTrack,
      });

      return reply.status(HttpStatus.OK).send(
        createSuccessResponse(
          responseData,
          'Budget status retrieved successfully',
          requestId
        )
      );
    } catch (error) {
      logger.error('Failed to fetch budget status', {
        requestId,
        error: (error as Error).message,
      });
      throw error;
    }
  });
}