import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { logger } from '../../config/logger';
import { NotionFinancialService } from '../../services';
import {
  GetRecentSpendingParamsSchema,
  UpdateDecisionParamsSchema,
  UpdateDecisionBodySchema,
  GetPendingRequestsQuerySchema,
  GetSpendingContextQuerySchema,
  HttpStatus,
  ErrorCodes,
} from '../schemas';
import { createSuccessResponse, createErrorResponse } from '../middleware';

export async function spendingRoutes(
  fastify: FastifyInstance,
  options: { financialService: NotionFinancialService }
) {
  const { financialService } = options;

  // GET /api/spending/pending - Get pending spending requests
  fastify.get('/api/spending/pending', {
    schema: {
      description: 'Get all pending spending requests with optional minimum amount filter',
      tags: ['spending'],
      querystring: {
        type: 'object',
        properties: {
          minAmount: {
            type: 'string',
            description: 'Minimum amount filter (default: 50)',
          },
        },
      },
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
                  amount: { type: 'number' },
                  description: { type: 'string' },
                  category: { type: 'string' },
                  status: { type: 'string' },
                  urgency: { type: 'string' },
                  requestDate: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            message: { type: 'string' },
            timestamp: { type: 'string' },
            requestId: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = (request as any).requestId;

    try {
      // Validate query parameters
      const query = GetPendingRequestsQuerySchema.parse(request.query);
      
      logger.info('Fetching pending spending requests', {
        requestId,
        minAmount: query.minAmount,
      });

      const pendingRequests = await financialService.getPendingRequests(query.minAmount);
      
      // Transform data for API response
      const responseData = pendingRequests.map(request => ({
        id: request.id,
        title: request.title,
        amount: request.amount,
        description: request.description,
        category: request.category,
        status: request.status,
        urgency: request.urgency,
        requestDate: request.requestDate.toISOString(),
        ...(request.tags && { tags: request.tags }),
      }));

      logger.info('Successfully fetched pending requests', {
        requestId,
        count: responseData.length,
        totalAmount: responseData.reduce((sum, req) => sum + req.amount, 0),
      });

      return reply.status(HttpStatus.OK).send(
        createSuccessResponse(
          responseData,
          `Found ${responseData.length} pending requests`,
          requestId
        )
      );
    } catch (error) {
      logger.error('Failed to fetch pending requests', {
        requestId,
        error: (error as Error).message,
      });
      throw error; // Let error handler handle it
    }
  });

  // GET /api/spending/recent/:days - Get recent spending history
  fastify.get('/api/spending/recent/:days', {
    schema: {
      description: 'Get recent spending requests for the specified number of days',
      tags: ['spending'],
      params: {
        type: 'object',
        required: ['days'],
        properties: {
          days: {
            type: 'string',
            pattern: '^[1-9]\\d*$',
            description: 'Number of days to look back (1-365)',
          },
        },
      },
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
                  amount: { type: 'number' },
                  category: { type: 'string' },
                  status: { type: 'string' },
                  urgency: { type: 'string' },
                  requestDate: { type: 'string' },
                  decisionDate: { type: 'string' },
                  reasoning: { type: 'string' },
                },
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
      // Validate parameters
      const params = GetRecentSpendingParamsSchema.parse(request.params);
      
      logger.info('Fetching recent spending requests', {
        requestId,
        days: params.days,
      });

      const recentRequests = await financialService.getRecentSpending(params.days);
      
      // Transform data for API response
      const responseData = recentRequests.map(request => ({
        id: request.id,
        title: request.title,
        amount: request.amount,
        category: request.category,
        status: request.status,
        urgency: request.urgency,
        requestDate: request.requestDate.toISOString(),
        ...(request.decisionDate && { 
          decisionDate: request.decisionDate.toISOString() 
        }),
        ...(request.reasoning && { reasoning: request.reasoning }),
      }));

      logger.info('Successfully fetched recent requests', {
        requestId,
        days: params.days,
        count: responseData.length,
        totalAmount: responseData.reduce((sum, req) => sum + req.amount, 0),
      });

      return reply.status(HttpStatus.OK).send(
        createSuccessResponse(
          responseData,
          `Found ${responseData.length} requests in the last ${params.days} days`,
          requestId
        )
      );
    } catch (error) {
      logger.error('Failed to fetch recent requests', {
        requestId,
        error: (error as Error).message,
      });
      throw error;
    }
  });

  // POST /api/spending/:id/decision - Update spending request decision
  fastify.post('/api/spending/:id/decision', {
    schema: {
      description: 'Update the decision for a pending spending request',
      tags: ['spending'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            minLength: 1,
            description: 'Spending request ID',
          },
        },
      },
      body: {
        type: 'object',
        required: ['decision', 'reasoning'],
        properties: {
          decision: {
            type: 'string',
            enum: ['Approved', 'Denied'],
            description: 'Decision for the spending request',
          },
          reasoning: {
            type: 'string',
            minLength: 10,
            maxLength: 500,
            description: 'Reasoning for the decision (10-500 characters)',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                decision: { type: 'string' },
                reasoning: { type: 'string' },
                updatedAt: { type: 'string' },
              },
            },
            message: { type: 'string' },
            timestamp: { type: 'string' },
            requestId: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = (request as any).requestId;

    try {
      // Validate parameters and body
      const params = UpdateDecisionParamsSchema.parse(request.params);
      const body = UpdateDecisionBodySchema.parse(request.body);
      
      logger.info('Updating spending request decision', {
        requestId,
        spendingRequestId: params.id,
        decision: body.decision,
      });

      await financialService.updateSpendingDecision(
        params.id,
        body.decision,
        body.reasoning
      );

      const responseData = {
        id: params.id,
        decision: body.decision,
        reasoning: body.reasoning,
        updatedAt: new Date().toISOString(),
      };

      logger.info('Successfully updated spending decision', {
        requestId,
        spendingRequestId: params.id,
        decision: body.decision,
      });

      return reply.status(HttpStatus.OK).send(
        createSuccessResponse(
          responseData,
          `Spending request ${body.decision.toLowerCase()} successfully`,
          requestId
        )
      );
    } catch (error) {
      logger.error('Failed to update spending decision', {
        requestId,
        error: (error as Error).message,
      });
      throw error;
    }
  });

  // GET /api/spending/context - Get comprehensive spending context
  fastify.get('/api/spending/context', {
    schema: {
      description: 'Get comprehensive spending analysis and context',
      tags: ['spending'],
      querystring: {
        type: 'object',
        properties: {
          days: {
            type: 'string',
            pattern: '^[1-9]\\d*$',
            description: 'Number of days to analyze (default: 30)',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                period: {
                  type: 'object',
                  properties: {
                    days: { type: 'number' },
                    startDate: { type: 'string' },
                    endDate: { type: 'string' },
                  },
                },
                summary: {
                  type: 'object',
                  properties: {
                    totalRequests: { type: 'number' },
                    totalAmount: { type: 'number' },
                    averageAmount: { type: 'number' },
                    pendingCount: { type: 'number' },
                    approvedCount: { type: 'number' },
                    deniedCount: { type: 'number' },
                  },
                },
                breakdown: { type: 'object' },
                trends: { type: 'object' },
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
      // Validate query parameters
      const query = GetSpendingContextQuerySchema.parse(request.query);
      const days = parseInt(query.days, 10);
      
      logger.info('Building spending context', {
        requestId,
        days,
      });

      const spendingContext = await financialService.buildSpendingContext(days);
      
      // Calculate additional statistics
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);

      // Group spending by category, urgency, and status
      const categoryBreakdown = Object.entries(spendingContext.categoryBreakdown).reduce(
        (acc, [category, amount]) => {
          const categoryRequests = spendingContext.recentSpending.filter(r => r.category === category);
          acc[category] = {
            count: categoryRequests.length,
            amount: amount,
            percentage: spendingContext.monthlyTotal > 0 
              ? Math.round((amount / spendingContext.monthlyTotal) * 100)
              : 0,
          };
          return acc;
        },
        {} as Record<string, any>
      );

      // Group by urgency
      const urgencyBreakdown = spendingContext.recentSpending.reduce((acc, request) => {
        if (!acc[request.urgency]) {
          acc[request.urgency] = { count: 0, amount: 0, percentage: 0 };
        }
        acc[request.urgency].count++;
        acc[request.urgency].amount += request.amount;
        return acc;
      }, {} as Record<string, any>);

      // Calculate percentages for urgency
      Object.values(urgencyBreakdown).forEach((urgency: any) => {
        urgency.percentage = spendingContext.monthlyTotal > 0 
          ? Math.round((urgency.amount / spendingContext.monthlyTotal) * 100)
          : 0;
      });

      // Group by status
      const statusBreakdown = spendingContext.recentSpending.reduce((acc, request) => {
        if (!acc[request.status]) {
          acc[request.status] = { count: 0, amount: 0, percentage: 0 };
        }
        acc[request.status].count++;
        acc[request.status].amount += request.amount;
        return acc;
      }, {} as Record<string, any>);

      // Calculate percentages for status
      Object.values(statusBreakdown).forEach((status: any) => {
        status.percentage = spendingContext.monthlyTotal > 0 
          ? Math.round((status.amount / spendingContext.monthlyTotal) * 100)
          : 0;
      });

      const responseData = {
        period: {
          days,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        summary: {
          totalRequests: spendingContext.recentSpending.length,
          totalAmount: spendingContext.monthlyTotal,
          averageAmount: spendingContext.averageRequestAmount,
          pendingCount: spendingContext.recentSpending.filter(r => r.status === 'Pending').length,
          approvedCount: spendingContext.recentSpending.filter(r => r.status === 'Approved').length,
          deniedCount: spendingContext.recentSpending.filter(r => r.status === 'Denied').length,
        },
        breakdown: {
          byCategory: categoryBreakdown,
          byUrgency: urgencyBreakdown,
          byStatus: statusBreakdown,
        },
        trends: {
          weeklyTotal: spendingContext.weeklyTotal,
          monthlyTotal: spendingContext.monthlyTotal,
          dailyAverage: Math.round((spendingContext.monthlyTotal / days) * 100) / 100,
        },
        recentSpending: spendingContext.recentSpending.slice(0, 10).map(request => ({
          id: request.id,
          title: request.title,
          amount: request.amount,
          category: request.category,
          status: request.status,
          requestDate: request.requestDate.toISOString(),
        })),
      };

      logger.info('Successfully built spending context', {
        requestId,
        days,
        totalRequests: responseData.summary.totalRequests,
        totalAmount: responseData.summary.totalAmount,
        categories: Object.keys(categoryBreakdown).length,
      });

      return reply.status(HttpStatus.OK).send(
        createSuccessResponse(
          responseData,
          `Spending context for ${days} days`,
          requestId
        )
      );
    } catch (error) {
      logger.error('Failed to build spending context', {
        requestId,
        error: (error as Error).message,
      });
      throw error;
    }
  });

  // GET /api/spending/:id/decision-context - Get decision context for specific request
  fastify.get('/api/spending/:id/decision-context', {
    schema: {
      description: 'Get comprehensive decision context for a spending request',
      tags: ['spending'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            minLength: 1,
            description: 'Spending request ID',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                request: { type: 'object' },
                recommendation: { type: 'object' },
                financialHealth: { type: 'object' },
                budgetImpact: { type: 'object' },
                similarRequests: { type: 'array' },
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
      const params = UpdateDecisionParamsSchema.parse(request.params);
      
      logger.info('Building decision context', {
        requestId,
        spendingRequestId: params.id,
      });

      const decisionContext = await financialService.buildDecisionContext(params.id);
      
      const responseData = {
        request: {
          id: decisionContext.request.id,
          title: decisionContext.request.title,
          amount: decisionContext.request.amount,
          category: decisionContext.request.category,
          urgency: decisionContext.request.urgency,
          requestDate: decisionContext.request.requestDate.toISOString(),
        },
        recommendation: {
          shouldApprove: decisionContext.recommendation.shouldApprove,
          confidence: decisionContext.recommendation.confidence,
          reasoning: decisionContext.recommendation.reasoning,
          ...(decisionContext.recommendation.conditions && {
            conditions: decisionContext.recommendation.conditions,
          }),
          ...(decisionContext.recommendation.alternatives && {
            alternatives: decisionContext.recommendation.alternatives,
          }),
        },
        financialHealth: {
          score: decisionContext.financialHealth.score,
          factors: decisionContext.financialHealth.factors,
          concerns: decisionContext.financialHealth.concerns,
        },
        budgetImpact: {
          remainingAfterApproval: decisionContext.budgetContext.remainingBudget - decisionContext.request.amount,
          percentageOfBudget: Math.round((decisionContext.request.amount / decisionContext.budgetContext.monthlyBudget) * 100),
          wouldExceedBudget: decisionContext.request.amount > decisionContext.budgetContext.remainingBudget,
        },
        ...(decisionContext.spendingPatterns.recentSimilar.length > 0 && {
          similarRequests: decisionContext.spendingPatterns.recentSimilar.map(similar => ({
            id: similar.id,
            amount: similar.amount,
            category: similar.category,
            status: similar.status,
            similarity: 0.8, // Placeholder - would need to implement similarity calculation
            requestDate: similar.requestDate.toISOString(),
          })),
        }),
      };

      logger.info('Successfully built decision context', {
        requestId,
        spendingRequestId: params.id,
        shouldApprove: responseData.recommendation.shouldApprove,
        confidence: responseData.recommendation.confidence,
        financialHealthScore: responseData.financialHealth.score,
      });

      return reply.status(HttpStatus.OK).send(
        createSuccessResponse(
          responseData,
          'Decision context built successfully',
          requestId
        )
      );
    } catch (error) {
      logger.error('Failed to build decision context', {
        requestId,
        error: (error as Error).message,
      });
      throw error;
    }
  });
}