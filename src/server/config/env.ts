import 'dotenv/config';
import { randomBytes } from 'crypto';
import { z } from 'zod';

const fallbackJwtSecret = randomBytes(32).toString('hex');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MANOPOLY_DB_PATH: z.string().default('.data/manopoly.db'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32)
    .optional()
    .transform((v) => v ?? fallbackJwtSecret),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  CLIENT_ORIGIN: z.string().default(''),
  APP_URL: z.string().default(''),
});

export const env = schema.parse(process.env);
