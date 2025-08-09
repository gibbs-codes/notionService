import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../config/logger';
import { config } from '../../config';
import { NotionFinancialService } from '../../services';
import { HttpStatus } from '../schemas';
import { createSuccessResponse, performHealthCheck } from '../middleware';

export async function healthRoutes(
  fastify: FastifyInstance,
  options: { financialService: NotionFinancialService }
) {
  const { financialService } = options;

  // GET /health - Simple health check
  fastify.get('/health', {
    schema: {
      description: 'Basic health check endpoint',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const uptime = process.uptime();
    
    return reply.status(HttpStatus.OK).send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.round(uptime),
    });
  });

  // GET /api/health - Detailed health check
  fastify.get('/api/health', {
    schema: {
      description: 'Comprehensive health check with service status details',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                version: { type: 'string' },
                environment: { type: 'string' },
                uptime: { type: 'number' },
                timestamp: { type: 'string' },
                services: {
                  type: 'object',
                  properties: {
                    notionClient: {
                      type: 'object',
                      properties: {
                        status: { type: 'string' },
                        responseTime: { type: 'number' },
                        lastCheck: { type: 'string' },
                        successRate: { type: 'number' },
                      },
                    },
                    spendingService: {
                      type: 'object',
                      properties: {
                        status: { type: 'string' },
                        lastOperation: { type: 'string' },
                        errorRate: { type: 'number' },
                      },
                    },
                    financialDataService: {
                      type: 'object',
                      properties: {
                        status: { type: 'string' },
                        lastOperation: { type: 'string' },
                        errorRate: { type: 'number' },
                      },
                    },
                  },
                },
                metrics: {
                  type: 'object',
                  properties: {
                    totalRequests: { type: 'number' },
                    avgResponseTime: { type: 'number' },
                    errorRate: { type: 'number' },
                    cacheHitRate: { type: 'number' },
                  },
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
      logger.info('Performing comprehensive health check', { requestId });

      const healthData = await performHealthCheck(financialService);

      // Determine HTTP status code based on overall health
      const statusCode = healthData.status === 'healthy' ? HttpStatus.OK :
                        healthData.status === 'degraded' ? HttpStatus.OK :
                        HttpStatus.SERVICE_UNAVAILABLE;

      logger.info('Health check completed', {
        requestId,
        status: healthData.status,
        servicesChecked: Object.keys(healthData.services).length,
        overallHealth: healthData.status,
      });

      return reply.status(statusCode).send(
        createSuccessResponse(
          healthData,
          `System is ${healthData.status}`,
          requestId
        )
      );
    } catch (error) {
      logger.error('Health check failed', {
        requestId,
        error: (error as Error).message,
      });

      // Return unhealthy status if health check itself fails
      const unhealthyData = {
        status: 'unhealthy',
        version: process.env.npm_package_version || '1.0.0',
        environment: config.NODE_ENV,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        services: {
          notionClient: { status: 'unhealthy', lastCheck: new Date().toISOString() },
          spendingService: { status: 'unhealthy' },
          financialDataService: { status: 'unhealthy' },
        },
        metrics: {
          totalRequests: 0,
          avgResponseTime: 0,
          errorRate: 100,
        },
        error: (error as Error).message,
      };

      return reply.status(HttpStatus.SERVICE_UNAVAILABLE).send(
        createSuccessResponse(
          unhealthyData,
          'Health check failed',
          requestId
        )
      );
    }
  });

  // GET /api/health/services - Individual service health status
  fastify.get('/api/health/services', {
    schema: {
      description: 'Get individual health status of each service component',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                notionClient: { type: 'object' },
                spendingService: { type: 'object' },
                financialDataService: { type: 'object' },
                decisionContextService: { type: 'object' },
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
      logger.info('Checking individual service health', { requestId });

      const metrics = financialService.getServiceMetrics();
      const cacheStats = financialService.getCacheStats();

      const serviceData = {
        notionClient: {
          status: metrics.notionClient.successRate > 80 ? 'healthy' : 
                 metrics.notionClient.successRate > 50 ? 'degraded' : 'unhealthy',
          totalRequests: metrics.notionClient.totalRequests,
          successfulRequests: metrics.notionClient.successfulRequests,
          failedRequests: metrics.notionClient.failedRequests,
          successRate: Math.round(metrics.notionClient.successRate * 100) / 100,
          avgResponseTime: metrics.notionClient.avgResponseTime,
          lastOperationTime: metrics.notionClient.lastOperationTime?.toISOString(),
          cache: {
            enabled: cacheStats.notionClient.enabled,
            size: cacheStats.notionClient.size,
            maxSize: cacheStats.notionClient.maxSize,
            hitRate: cacheStats.notionClient.hitRate,
          },
        },
        spendingService: {
          status: metrics.spendingService.notionClientMetrics?.successRate > 80 ? 'healthy' : 
                 metrics.spendingService.notionClientMetrics?.successRate > 50 ? 'degraded' : 'unhealthy',
          lastOperation: metrics.spendingService.notionClientMetrics?.lastOperationTime?.toISOString(),
          totalOperations: metrics.spendingService.notionClientMetrics?.totalRequests || 0,
        },
        financialDataService: {
          status: metrics.financialDataService.errorRate < 5 ? 'healthy' :
                 metrics.financialDataService.errorRate < 15 ? 'degraded' : 'unhealthy',
          lastOperation: metrics.financialDataService.lastOperationTime?.toISOString(),
          errorRate: Math.round(metrics.financialDataService.errorRate * 100) / 100,
          totalOperations: metrics.financialDataService.totalOperations,
        },
        decisionContextService: {
          status: metrics.decisionContextService.errorRate < 5 ? 'healthy' :
                 metrics.decisionContextService.errorRate < 15 ? 'degraded' : 'unhealthy',
          lastOperation: metrics.decisionContextService.lastOperationTime?.toISOString(),
          errorRate: Math.round(metrics.decisionContextService.errorRate * 100) / 100,
          totalOperations: metrics.decisionContextService.totalOperations,
        },
      };

      logger.info('Individual service health check completed', {
        requestId,
        services: Object.keys(serviceData),
        healthyServices: Object.values(serviceData).filter(s => s.status === 'healthy').length,
      });

      return reply.status(HttpStatus.OK).send(
        createSuccessResponse(
          serviceData,
          'Individual service health retrieved',
          requestId
        )
      );
    } catch (error) {
      logger.error('Failed to check individual service health', {
        requestId,
        error: (error as Error).message,
      });
      throw error;
    }
  });

  // GET /api/health/metrics - System metrics and performance data
  fastify.get('/api/health/metrics', {
    schema: {
      description: 'Get detailed system metrics and performance data',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                system: { type: 'object' },
                application: { type: 'object' },
                notion: { type: 'object' },
                cache: { type: 'object' },
                configuration: { type: 'object' },
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
      logger.info('Gathering system metrics', { requestId });

      const metrics = financialService.getServiceMetrics();
      const cacheStats = financialService.getCacheStats();

      const metricsData = {
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          uptime: Math.round(process.uptime()),
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), // MB
            external: Math.round(process.memoryUsage().external / 1024 / 1024), // MB
          },
          cpu: {
            loadAverage: process.loadavg(),
          },
        },
        application: {
          version: process.env.npm_package_version || '1.0.0',
          environment: config.NODE_ENV,
          initialized: metrics.initialized,
          uptime: Math.round(metrics.uptime / 1000), // seconds
          configuration: {
            spendingDatabase: metrics.configuration.spendingDatabase ? '✓' : '✗',
            goalsConfigured: metrics.configuration.goalsConfigured ? '✓' : '✗',
            debtsConfigured: metrics.configuration.debtsConfigured ? '✓' : '✗',
            accountsConfigured: metrics.configuration.accountsConfigured ? '✓' : '✗',
            defaultBudget: metrics.configuration.defaultBudget,
            minimumSpendingAmount: metrics.configuration.minimumSpendingAmount,
          },
        },
        notion: {
          totalRequests: metrics.notionClient.totalRequests,
          successfulRequests: metrics.notionClient.successfulRequests,
          failedRequests: metrics.notionClient.failedRequests,
          successRate: Math.round(metrics.notionClient.successRate * 100) / 100,
          avgResponseTime: Math.round(metrics.notionClient.avgResponseTime || 0),
          lastOperationTime: metrics.notionClient.lastOperationTime?.toISOString(),
          rateLimitHits: metrics.notionClient.rateLimitHits || 0,
        },
        cache: {
          enabled: cacheStats.notionClient.enabled,
          totalSize: cacheStats.notionClient.size,
          maxSize: cacheStats.notionClient.maxSize,
          hitRate: Math.round((cacheStats.notionClient.hitRate || 0) * 100),
          missRate: Math.round((1 - (cacheStats.notionClient.hitRate || 0)) * 100),
          evictions: cacheStats.notionClient.evictions || 0,
        },
        configuration: {
          logLevel: config.LOG_LEVEL,
          port: config.PORT,
          nodeEnv: config.NODE_ENV,
          hasNotionToken: !!config.NOTION_TOKEN,
          hasSpendingDatabase: !!config.SPENDING_DATABASE_ID,
        },
      };

      logger.info('System metrics gathered successfully', {
        requestId,
        totalRequests: metricsData.notion.totalRequests,
        successRate: metricsData.notion.successRate,
        cacheHitRate: metricsData.cache.hitRate,
        uptime: metricsData.application.uptime,
      });

      return reply.status(HttpStatus.OK).send(
        createSuccessResponse(
          metricsData,
          'System metrics retrieved successfully',
          requestId
        )
      );
    } catch (error) {
      logger.error('Failed to gather system metrics', {
        requestId,
        error: (error as Error).message,
      });
      throw error;
    }
  });

  // POST /api/health/cache/clear - Clear all caches
  fastify.post('/api/health/cache/clear', {
    schema: {
      description: 'Clear all service caches',
      tags: ['health', 'admin'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                cleared: { type: 'boolean' },
                clearedAt: { type: 'string' },
                previousStats: { type: 'object' },
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
      logger.info('Clearing all service caches', { requestId });

      // Get current cache stats before clearing
      const previousStats = financialService.getCacheStats();
      
      // Clear all caches
      financialService.clearCaches();
      
      const responseData = {
        cleared: true,
        clearedAt: new Date().toISOString(),
        previousStats: {
          notionClient: {
            size: previousStats.notionClient.size,
            hitRate: Math.round((previousStats.notionClient.hitRate || 0) * 100),
          },
        },
      };

      logger.info('Successfully cleared all caches', {
        requestId,
        previousCacheSize: previousStats.notionClient.size,
        clearedAt: responseData.clearedAt,
      });

      return reply.status(HttpStatus.OK).send(
        createSuccessResponse(
          responseData,
          'All caches cleared successfully',
          requestId
        )
      );
    } catch (error) {
      logger.error('Failed to clear caches', {
        requestId,
        error: (error as Error).message,
      });
      throw error;
    }
  });
}