import { FastifyInstance } from 'fastify';
import { healthRoutes } from './health';
import { spendingRoutes } from './spending';
import { financialRoutes } from './financial';
import { NotionFinancialService } from '../../services';

export interface RouteOptions {
  financialService: NotionFinancialService;
}

/**
 * Register all API routes with the Fastify instance
 */
export async function registerRoutes(
  server: FastifyInstance, 
  options: RouteOptions
): Promise<void> {
  // Register health routes
  await server.register(healthRoutes, options);

  // Register spending routes
  await server.register(spendingRoutes, options);

  // Register financial routes
  await server.register(financialRoutes, options);
}

// Export route modules for individual use if needed
export { healthRoutes, spendingRoutes, financialRoutes };