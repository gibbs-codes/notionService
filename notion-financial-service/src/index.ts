import Fastify from 'fastify';
import { config } from './config';
import { logger } from './config/logger';
import { createNotionFinancialService, NotionFinancialServiceConfig } from './services';
import { 
  errorHandler, 
  requestLoggingHook, 
  corsHook, 
  rateLimitHook 
} from './api/middleware';
import { spendingRoutes } from './api/routes/spending';
import { financialRoutes } from './api/routes/financial';
import { healthRoutes } from './api/routes/health';

// Create Fastify instance with proper logger configuration
const server = Fastify({
  logger: config.NODE_ENV === 'development' ? (logger as any) : true,
  trustProxy: true, // Important for proper IP detection behind proxies
  bodyLimit: 1048576, // 1MB body limit
  keepAliveTimeout: 30000, // 30 seconds
});

// Global variables for graceful shutdown
let financialService: any;
let isShuttingDown = false;

// Register global hooks and middleware
server.addHook('preHandler', requestLoggingHook);
server.addHook('preHandler', corsHook);
server.addHook('preHandler', rateLimitHook);

// Register global error handler
server.setErrorHandler(errorHandler);

// Add shutdown detection middleware
server.addHook('preHandler', async (request, reply) => {
  if (isShuttingDown) {
    reply.status(503).send({
      success: false,
      error: 'SERVICE_UNAVAILABLE',
      message: 'Server is shutting down',
      timestamp: new Date().toISOString(),
    });
  }
});

// Register OpenAPI documentation (optional)
if (config.NODE_ENV === 'development') {
  server.register(require('@fastify/swagger'), {
    swagger: {
      info: {
        title: 'Notion Financial Service API',
        description: 'API for managing financial data through Notion',
        version: '1.0.0',
      },
      host: `localhost:${config.PORT}`,
      schemes: ['http'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'health', description: 'Health check endpoints' },
        { name: 'spending', description: 'Spending request management' },
        { name: 'financial', description: 'Financial data and analysis' },
      ],
    },
  });

  server.register(require('@fastify/swagger-ui'), {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header: string) => header,
  });
}

// Initialize the financial service and register routes
async function initializeServer(): Promise<void> {
  try {
    logger.info('Initializing Notion Financial Service...');

    // Create financial service configuration
    const serviceConfig: NotionFinancialServiceConfig = {
      token: config.NOTION_TOKEN,
      spendingDatabase: config.SPENDING_DATABASE_ID,
      goalsDatabase: config.GOALS_DATABASE_ID,
      debtsDatabase: config.DEBTS_DATABASE_ID,
      accountsDatabase: config.ACCOUNTS_DATABASE_ID,
      defaultMonthlyBudget: 3000,
      minimumSpendingAmount: 50,
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      requestTimeout: 30000,
      rateLimit: {
        requestsPerSecond: 3,
      },
      cache: {
        enabled: true,
        ttlMs: 300000, // 5 minutes
        maxSize: 1000,
      },
    };

    // Initialize the financial service
    financialService = await createNotionFinancialService(serviceConfig);

    logger.info('Financial service initialized successfully');

    // Register all route modules
    await server.register(healthRoutes, { 
      financialService 
    });

    await server.register(spendingRoutes, { 
      financialService 
    });

    await server.register(financialRoutes, { 
      financialService 
    });

    // Register a catch-all route for undefined endpoints
    server.setNotFoundHandler((request, reply) => {
      const requestId = (request as any).requestId || 'unknown';
      
      logger.warn('Route not found', {
        requestId,
        method: request.method,
        url: request.url,
        ip: request.ip,
      });

      reply.status(404).send({
        success: false,
        error: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        timestamp: new Date().toISOString(),
        requestId,
      });
    });

    logger.info('All routes registered successfully');

  } catch (error) {
    logger.error('Failed to initialize server', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    throw error;
  }
}

// Graceful shutdown handling
const shutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress, ignoring signal', { signal });
    return;
  }

  isShuttingDown = true;
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  // Set a timeout for forced shutdown
  const forceShutdownTimer = setTimeout(() => {
    logger.error('Graceful shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, 30000); // 30 seconds

  try {
    // Stop accepting new requests
    logger.info('Stopping server from accepting new connections...');
    await server.close();

    // Clean up financial service
    if (financialService) {
      logger.info('Cleaning up financial service...');
      financialService.clearCaches();
    }

    // Clear the force shutdown timer
    clearTimeout(forceShutdownTimer);

    logger.info('Graceful shutdown completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    
    clearTimeout(forceShutdownTimer);
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  
  // Try to shutdown gracefully, then force exit
  shutdown('uncaughtException').finally(() => {
    setTimeout(() => process.exit(1), 1000);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', {
    reason: String(reason),
    promise: String(promise),
  });
  
  // Try to shutdown gracefully, then force exit
  shutdown('unhandledRejection').finally(() => {
    setTimeout(() => process.exit(1), 1000);
  });
});

// Start the server
async function start(): Promise<void> {
  try {
    // Initialize the server and services
    await initializeServer();

    // Start listening
    const address = await server.listen({ 
      port: config.PORT, 
      host: '0.0.0.0' 
    });

    logger.info('Server started successfully', {
      address,
      port: config.PORT,
      environment: config.NODE_ENV,
      nodeVersion: process.version,
      documentation: config.NODE_ENV === 'development' ? `http://localhost:${config.PORT}/docs` : undefined,
    });

    // Log available endpoints
    logger.info('Available endpoints:', {
      health: [
        'GET /health',
        'GET /api/health',
        'GET /api/health/services',
        'GET /api/health/metrics',
        'POST /api/health/cache/clear',
      ],
      spending: [
        'GET /api/spending/pending',
        'GET /api/spending/recent/:days',
        'POST /api/spending/:id/decision',
        'GET /api/spending/context',
        'GET /api/spending/:id/decision-context',
      ],
      financial: [
        'GET /api/financial/context',
        'GET /api/financial/goals',
        'GET /api/financial/debts',
        'GET /api/financial/accounts',
        'GET /api/financial/budget',
      ],
    });

  } catch (error) {
    logger.error('Failed to start server', {
      error: (error as Error).message,
      stack: (error as Error).stack,
      port: config.PORT,
    });
    process.exit(1);
  }
}

// Start the application
start();