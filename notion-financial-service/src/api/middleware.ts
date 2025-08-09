import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { HttpStatus, ErrorCodes } from './schemas';
import {
  NotionError,
  NotionRateLimitError,
  NotionAuthError,
  NotionPermissionError,
  NotionNotFoundError,
  NotionTimeoutError,
  NotionConnectionError,
  SpendingRequestServiceError,
  FinancialDataServiceError,
  DecisionContextServiceError,
  NotionFinancialServiceError,
} from '../services';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

// Generate unique request ID for tracking
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Request timing and logging middleware
export async function requestLoggingHook(request: FastifyRequest, reply: FastifyReply) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  // Add request ID to request context
  (request as any).requestId = requestId;
  reply.header('X-Request-ID', requestId);
  
  // Log incoming request
  logger.info('Incoming request', {
    requestId,
    method: request.method,
    url: request.url,
    userAgent: request.headers['user-agent'],
    ip: request.ip,
    timestamp: new Date().toISOString(),
  });

  // Log response when finished
  reply.addHook('onSend', async (request, reply, payload) => {
    const duration = Date.now() - startTime;
    const statusCode = reply.statusCode;
    
    logger.info('Request completed', {
      requestId,
      method: request.method,
      url: request.url,
      statusCode,
      duration,
      contentLength: payload ? Buffer.byteLength(payload.toString()) : 0,
      timestamp: new Date().toISOString(),
    });

    // Track metrics for monitoring
    if (statusCode >= 400) {
      logger.warn('Request failed', {
        requestId,
        statusCode,
        duration,
        url: request.url,
        method: request.method,
      });
    }

    return payload;
  });
}

// CORS middleware
export async function corsHook(request: FastifyRequest, reply: FastifyReply) {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
  reply.header('Access-Control-Max-Age', '86400'); // 24 hours
  
  if (request.method === 'OPTIONS') {
    reply.status(204).send();
  }
}

// Rate limiting check (basic implementation)
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export async function rateLimitHook(request: FastifyRequest, reply: FastifyReply) {
  const clientIP = request.ip;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 100; // 100 requests per minute
  
  const clientData = requestCounts.get(clientIP);
  
  if (!clientData || now > clientData.resetTime) {
    requestCounts.set(clientIP, {
      count: 1,
      resetTime: now + windowMs,
    });
  } else {
    clientData.count++;
    
    if (clientData.count > maxRequests) {
      reply.status(HttpStatus.TOO_MANY_REQUESTS);
      throw new Error('Rate limit exceeded. Please try again later.');
    }
  }
  
  // Cleanup old entries periodically
  if (Math.random() < 0.01) { // 1% chance to cleanup
    for (const [ip, data] of requestCounts.entries()) {
      if (now > data.resetTime) {
        requestCounts.delete(ip);
      }
    }
  }
}

// Global error handler
export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  const requestId = (request as any).requestId || 'unknown';
  const timestamp = new Date().toISOString();

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const validationErrors = error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message,
      value: issue.input,
    }));

    logger.warn('Validation error', {
      requestId,
      errors: validationErrors,
      url: request.url,
      method: request.method,
    });

    return reply.status(HttpStatus.BAD_REQUEST).send({
      success: false,
      error: ErrorCodes.VALIDATION_ERROR,
      message: 'Invalid request data',
      details: { validationErrors },
      timestamp,
      requestId,
    });
  }

  // Handle Notion API errors
  if (error instanceof NotionRateLimitError) {
    logger.warn('Notion rate limit exceeded', { requestId, retryAfter: error.retryAfter });
    return reply.status(HttpStatus.TOO_MANY_REQUESTS).send({
      success: false,
      error: ErrorCodes.RATE_LIMITED,
      message: 'API rate limit exceeded. Please try again later.',
      details: { retryAfter: error.retryAfter },
      timestamp,
      requestId,
    });
  }

  if (error instanceof NotionAuthError) {
    logger.error('Notion authentication error', { requestId, message: error.message });
    return reply.status(HttpStatus.UNAUTHORIZED).send({
      success: false,
      error: ErrorCodes.UNAUTHORIZED,
      message: 'Authentication failed with Notion API',
      timestamp,
      requestId,
    });
  }

  if (error instanceof NotionPermissionError) {
    logger.error('Notion permission error', { requestId, message: error.message });
    return reply.status(HttpStatus.FORBIDDEN).send({
      success: false,
      error: ErrorCodes.UNAUTHORIZED,
      message: 'Insufficient permissions for Notion API',
      timestamp,
      requestId,
    });
  }

  if (error instanceof NotionNotFoundError) {
    logger.warn('Notion resource not found', { requestId, message: error.message });
    return reply.status(HttpStatus.NOT_FOUND).send({
      success: false,
      error: ErrorCodes.NOT_FOUND,
      message: 'Requested resource not found',
      timestamp,
      requestId,
    });
  }

  if (error instanceof NotionTimeoutError || error instanceof NotionConnectionError) {
    logger.error('Notion service unavailable', { 
      requestId, 
      errorType: error.constructor.name,
      message: error.message 
    });
    return reply.status(HttpStatus.SERVICE_UNAVAILABLE).send({
      success: false,
      error: ErrorCodes.SERVICE_UNAVAILABLE,
      message: 'External service temporarily unavailable',
      timestamp,
      requestId,
    });
  }

  if (error instanceof NotionError) {
    logger.error('Notion API error', { 
      requestId, 
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return reply.status(HttpStatus.BAD_GATEWAY).send({
      success: false,
      error: ErrorCodes.NOTION_ERROR,
      message: 'External API error',
      details: { code: error.code },
      timestamp,
      requestId,
    });
  }

  // Handle service-specific errors
  if (error instanceof SpendingRequestServiceError || 
      error instanceof FinancialDataServiceError || 
      error instanceof DecisionContextServiceError ||
      error instanceof NotionFinancialServiceError) {
    
    const statusCode = error.code === 'NOT_FOUND' ? HttpStatus.NOT_FOUND : 
                      error.code === 'VALIDATION_ERROR' ? HttpStatus.BAD_REQUEST :
                      HttpStatus.INTERNAL_SERVER_ERROR;

    logger.error('Service error', {
      requestId,
      service: error.constructor.name,
      code: error.code,
      message: error.message,
      details: error.details,
    });

    return reply.status(statusCode).send({
      success: false,
      error: error.code || ErrorCodes.INTERNAL_ERROR,
      message: error.message,
      details: error.details,
      timestamp,
      requestId,
    });
  }

  // Handle Fastify validation errors
  if (error.validation) {
    logger.warn('Fastify validation error', {
      requestId,
      validation: error.validation,
      validationContext: error.validationContext,
    });

    return reply.status(HttpStatus.BAD_REQUEST).send({
      success: false,
      error: ErrorCodes.VALIDATION_ERROR,
      message: 'Request validation failed',
      details: { validation: error.validation },
      timestamp,
      requestId,
    });
  }

  // Handle rate limiting errors
  if (error.message.includes('Rate limit exceeded')) {
    logger.warn('Rate limit exceeded', { requestId, ip: request.ip });
    return reply.status(HttpStatus.TOO_MANY_REQUESTS).send({
      success: false,
      error: ErrorCodes.RATE_LIMITED,
      message: 'Too many requests. Please try again later.',
      timestamp,
      requestId,
    });
  }

  // Handle 404 errors
  if (error.statusCode === 404) {
    logger.warn('Route not found', { 
      requestId, 
      method: request.method, 
      url: request.url 
    });
    return reply.status(HttpStatus.NOT_FOUND).send({
      success: false,
      error: ErrorCodes.NOT_FOUND,
      message: 'Endpoint not found',
      timestamp,
      requestId,
    });
  }

  // Generic error fallback
  logger.error('Unhandled error', {
    requestId,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode,
      code: error.code,
    },
    request: {
      method: request.method,
      url: request.url,
      headers: request.headers,
      ip: request.ip,
    },
  });

  const statusCode = error.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
  return reply.status(statusCode).send({
    success: false,
    error: ErrorCodes.INTERNAL_ERROR,
    message: process.env.NODE_ENV === 'development' 
      ? error.message 
      : 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { 
      details: { 
        stack: error.stack,
        originalError: error.name,
      } 
    }),
    timestamp,
    requestId,
  });
}

// Health check helper
export async function performHealthCheck(financialService: any) {
  try {
    const healthStatus = await financialService.healthCheck();
    const metrics = financialService.getServiceMetrics();
    
    return {
      status: healthStatus.overall,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: healthStatus.uptime,
      timestamp: new Date().toISOString(),
      services: {
        notionClient: {
          status: healthStatus.services.notionClient.status,
          responseTime: metrics.notionClient.avgResponseTime,
          lastCheck: healthStatus.services.notionClient.lastCheck.toISOString(),
          successRate: metrics.notionClient.successRate,
        },
        spendingService: {
          status: healthStatus.services.spendingService.status,
          lastOperation: healthStatus.services.spendingService.lastOperation?.toISOString(),
          errorRate: healthStatus.services.spendingService.errorRate || 0,
        },
        financialDataService: {
          status: healthStatus.services.financialDataService.status,
          lastOperation: healthStatus.services.financialDataService.lastOperation?.toISOString(),
          errorRate: healthStatus.services.financialDataService.errorRate || 0,
        },
      },
      metrics: {
        totalRequests: metrics.notionClient.totalRequests,
        avgResponseTime: metrics.notionClient.avgResponseTime || 0,
        errorRate: ((metrics.notionClient.totalRequests - metrics.notionClient.successfulRequests) / 
                   Math.max(metrics.notionClient.totalRequests, 1)) * 100,
        cacheHitRate: metrics.notionClient.cacheStats?.hitRate,
      },
    };
  } catch (error) {
    logger.error('Health check failed', { error: (error as Error).message });
    throw error;
  }
}

// Response helper functions
export function createSuccessResponse(data: any, message?: string, requestId?: string) {
  return {
    success: true,
    data,
    ...(message && { message }),
    timestamp: new Date().toISOString(),
    ...(requestId && { requestId }),
  };
}

export function createErrorResponse(
  error: string, 
  message: string, 
  details?: any, 
  requestId?: string
) {
  return {
    success: false,
    error,
    message,
    ...(details && { details }),
    timestamp: new Date().toISOString(),
    ...(requestId && { requestId }),
  };
}