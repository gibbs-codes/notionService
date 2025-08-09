import 'dotenv/config';
import { fastify } from 'fastify';
import { logger } from './config/logger';

const server = fastify({ logger });

const start = async (): Promise<void> => {
  try {
    const port = Number(process.env.PORT) || 8081;
    await server.listen({ port, host: '0.0.0.0' });
    logger.info(`Server listening on http://localhost:${port}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

start();