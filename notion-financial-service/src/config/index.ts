import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const ConfigSchema = z.object({
  NOTION_TOKEN: z.string().min(1),
  SPENDING_DATABASE_ID: z.string().min(1),
  GOALS_DATABASE_ID: z.string().min(1).optional(),
  DEBTS_DATABASE_ID: z.string().min(1).optional(),
  ACCOUNTS_DATABASE_ID: z.string().min(1).optional(),
  PORT: z.coerce.number().default(8081),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const config = ConfigSchema.parse(process.env);