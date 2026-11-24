import { app } from '../src/server/http/app.ts';
import { ensureDatabaseSchema } from '../src/server/infra/db.ts';

// Vercel serverless functions are cold-started independently. Ensure the shared
// PostgreSQL schema exists before any API route (including the room list) queries it.
// The initializer caches its promise for warm invocations in this function instance.
export default async function handler(req: any, res: any) {
  try {
    await ensureDatabaseSchema();
  } catch (error) {
    // Keep secrets and connection strings out of logs and HTTP responses.
    console.error('[vercel-api] database initialization failed', {
      method: req.method,
      url: req.url,
      error: error instanceof Error ? error.message : 'Unknown database error',
    });
    return res.status(503).json({
      error: 'DATABASE_UNAVAILABLE',
      message: 'Database is unavailable. Check DATABASE_URL and the Vercel function logs.',
    });
  }

  return app(req, res);
}
