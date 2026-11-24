type VercelRequest = {
  method?: string;
  url?: string;
  [key: string]: unknown;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => unknown;
  [key: string]: unknown;
};

function safeErrorDetails(error: unknown) {
  if (!(error instanceof Error)) return { message: 'Unknown startup error' };
  // Avoid accidentally writing connection strings or credentials to deployment logs.
  const message = error.message.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, '[redacted database URL]');
  return { name: error.name, message, stack: error.stack?.split('\n').slice(0, 8).join('\n') };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Import lazily so environment/configuration and bundling errors are caught
    // and reported as JSON instead of Vercel's generic FUNCTION_INVOCATION_FAILED page.
    const [{ app }, { ensureDatabaseSchema }] = await Promise.all([
      import('../src/server/http/app.ts'),
      import('../src/server/infra/db.ts'),
    ]);
    await ensureDatabaseSchema();
    return app(req, res);
  } catch (error) {
    console.error('[vercel-api] function startup/request failed', {
      method: req.method,
      url: req.url,
      ...safeErrorDetails(error),
    });
    return res.status(503).json({
      error: 'API_STARTUP_FAILED',
      message: 'API configuration or database initialization failed. Check this deployment’s Function Logs and required environment variables.',
    });
  }
}
