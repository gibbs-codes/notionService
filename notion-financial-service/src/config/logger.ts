import pino from 'pino';
import { config } from './index';

export const logger = pino(
  config.NODE_ENV === 'development'
    ? {
        level: config.LOG_LEVEL,
        transport: {
          target: 'pino-pretty',
          options: { 
            colorize: true,
            translateTime: true,
          },
        },
      }
    : {
        level: config.LOG_LEVEL,
      }
);