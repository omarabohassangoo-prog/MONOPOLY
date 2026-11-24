import 'dotenv/config';
import { randomBytes } from 'crypto';
import { z } from 'zod';

const fallbackJwtSecret = randomBytes(32).toString('hex');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().optional(),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32)
    .optional()
    .transform((v) => v ?? fallbackJwtSecret),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  CLIENT_ORIGIN: z.string().default(''),
  APP_URL: z.string().default(''),
});

export const env = schema.superRefine((value, ctx) => {
  if (value.NODE_ENV !== 'test' && !value.DATABASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_URL'],
      message: 'DATABASE_URL is required to connect to Neon',
    });
  }
  if (value.NODE_ENV === 'production' && !process.env.JWT_ACCESS_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_ACCESS_SECRET'],
      message: 'JWT_ACCESS_SECRET is required in production',
    });
  }
}).parse(process.env);
