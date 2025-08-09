import { z } from 'zod';
import { SpendingStatus } from '../types';

// API Request Schemas
export const GetRecentSpendingParamsSchema = z.object({
  days: z.string().transform(val => parseInt(val, 10)).refine(val => !isNaN(val) && val > 0 && val <= 365, {
    message: 'Days must be a number between 1 and 365'
  })
});

export const UpdateDecisionParamsSchema = z.object({
  id: z.string().min(1, 'Request ID is required')
});

export const UpdateDecisionBodySchema = z.object({
  decision: z.enum(['Approved', 'Denied'], {
    errorMap: () => ({ message: 'Decision must be either "Approved" or "Denied"' })
  }),
  reasoning: z.string().min(10, 'Reasoning must be at least 10 characters').max(500, 'Reasoning cannot exceed 500 characters')
});

export const GetPendingRequestsQuerySchema = z.object({
  minAmount: z.string().transform(val => parseFloat(val)).refine(val => !isNaN(val) && val >= 0, {
    message: 'Minimum amount must be a positive number'
  }).optional()
});

export const GetSpendingContextQuerySchema = z.object({
  days: z.string().transform(val => parseInt(val, 10)).refine(val => !isNaN(val) && val > 0 && val <= 365, {
    message: 'Days must be a number between 1 and 365'
  }).default('30')
});

// API Response Schemas
export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string(),
  details: z.record(z.any()).optional(),
  timestamp: z.string(),
  requestId: z.string().optional()
});

export const ApiSuccessResponseSchema = z.object({
  success: z.literal(true),
  data: z.any(),
  message: z.string().optional(),
  timestamp: z.string(),
  requestId: z.string().optional()
});

export const HealthCheckResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    version: z.string(),
    environment: z.string(),
    uptime: z.number(),
    timestamp: z.string(),
    services: z.object({
      notionClient: z.object({
        status: z.enum(['healthy', 'degraded', 'unhealthy']),
        responseTime: z.number().optional(),
        lastCheck: z.string(),
        successRate: z.number().optional()
      }),
      spendingService: z.object({
        status: z.enum(['healthy', 'degraded', 'unhealthy']),
        lastOperation: z.string().optional(),
        errorRate: z.number().optional()
      }),
      financialDataService: z.object({
        status: z.enum(['healthy', 'degraded', 'unhealthy']),
        lastOperation: z.string().optional(),
        errorRate: z.number().optional()
      })
    }),
    metrics: z.object({
      totalRequests: z.number(),
      avgResponseTime: z.number(),
      errorRate: z.number(),
      cacheHitRate: z.number().optional()
    }).optional()
  })
});

export const SpendingRequestResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(z.object({
    id: z.string(),
    title: z.string(),
    amount: z.number(),
    description: z.string().optional(),
    category: z.string(),
    status: z.enum(['Pending', 'Approved', 'Denied'] as const),
    urgency: z.string(),
    requestDate: z.string(),
    decisionDate: z.string().optional(),
    reasoning: z.string().optional(),
    tags: z.array(z.string()).optional()
  })),
  pagination: z.object({
    total: z.number(),
    limit: z.number(),
    page: z.number(),
    hasNext: z.boolean(),
    hasPrevious: z.boolean()
  }).optional()
});

export const SpendingContextResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    period: z.object({
      days: z.number(),
      startDate: z.string(),
      endDate: z.string()
    }),
    summary: z.object({
      totalRequests: z.number(),
      totalAmount: z.number(),
      averageAmount: z.number(),
      pendingCount: z.number(),
      approvedCount: z.number(),
      deniedCount: z.number()
    }),
    breakdown: z.object({
      byCategory: z.record(z.object({
        count: z.number(),
        amount: z.number(),
        percentage: z.number()
      })),
      byUrgency: z.record(z.object({
        count: z.number(),
        amount: z.number(),
        percentage: z.number()
      })),
      byStatus: z.record(z.object({
        count: z.number(),
        amount: z.number(),
        percentage: z.number()
      }))
    }),
    trends: z.object({
      weeklyTotal: z.number(),
      monthlyTotal: z.number(),
      dailyAverage: z.number(),
      weekOverWeekChange: z.number().optional(),
      monthOverMonthChange: z.number().optional()
    }),
    recentSpending: z.array(z.object({
      id: z.string(),
      title: z.string(),
      amount: z.number(),
      category: z.string(),
      status: z.string(),
      requestDate: z.string()
    }))
  })
});

export const FinancialContextResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    netWorth: z.number(),
    totalAssets: z.number(),
    totalLiabilities: z.number(),
    monthlyIncome: z.number().optional(),
    monthlyExpenses: z.number().optional(),
    emergencyFund: z.number().optional(),
    goals: z.object({
      active: z.number(),
      completed: z.number(),
      totalTargetAmount: z.number(),
      totalProgress: z.number(),
      completionRate: z.number()
    }),
    debts: z.object({
      count: z.number(),
      totalAmount: z.number(),
      monthlyPayments: z.number(),
      highPriorityCount: z.number(),
      averageInterestRate: z.number().optional()
    }),
    budget: z.object({
      monthlyBudget: z.number(),
      currentSpending: z.number(),
      remainingBudget: z.number(),
      percentageUsed: z.number(),
      status: z.enum(['excellent', 'good', 'warning', 'critical']),
      projectedOverage: z.number().optional()
    }),
    cashFlow: z.object({
      availableFunds: z.number(),
      projectedEndOfMonth: z.number(),
      recommendedSavings: z.number()
    }).optional()
  })
});

export const DecisionContextResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    request: z.object({
      id: z.string(),
      title: z.string(),
      amount: z.number(),
      category: z.string(),
      urgency: z.string(),
      requestDate: z.string()
    }),
    recommendation: z.object({
      shouldApprove: z.boolean(),
      confidence: z.number().min(0).max(100),
      reasoning: z.array(z.string()),
      conditions: z.array(z.string()).optional(),
      alternatives: z.array(z.string()).optional()
    }),
    financialHealth: z.object({
      score: z.number().min(0).max(100),
      factors: z.array(z.string()),
      concerns: z.array(z.string())
    }),
    budgetImpact: z.object({
      remainingAfterApproval: z.number(),
      percentageOfBudget: z.number(),
      wouldExceedBudget: z.boolean()
    }),
    similarRequests: z.array(z.object({
      id: z.string(),
      amount: z.number(),
      category: z.string(),
      status: z.string(),
      similarity: z.number().min(0).max(1),
      requestDate: z.string()
    })).optional()
  })
});

// Type exports for TypeScript
export type GetRecentSpendingParams = z.infer<typeof GetRecentSpendingParamsSchema>;
export type UpdateDecisionParams = z.infer<typeof UpdateDecisionParamsSchema>;
export type UpdateDecisionBody = z.infer<typeof UpdateDecisionBodySchema>;
export type GetPendingRequestsQuery = z.infer<typeof GetPendingRequestsQuerySchema>;
export type GetSpendingContextQuery = z.infer<typeof GetSpendingContextQuerySchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type ApiSuccessResponse = z.infer<typeof ApiSuccessResponseSchema>;
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
export type SpendingRequestResponse = z.infer<typeof SpendingRequestResponseSchema>;
export type SpendingContextResponse = z.infer<typeof SpendingContextResponseSchema>;
export type FinancialContextResponse = z.infer<typeof FinancialContextResponseSchema>;
export type DecisionContextResponse = z.infer<typeof DecisionContextResponseSchema>;

// HTTP Status Codes
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

// Error codes for consistent error handling
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMITED: 'RATE_LIMITED',
  NOTION_ERROR: 'NOTION_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const;