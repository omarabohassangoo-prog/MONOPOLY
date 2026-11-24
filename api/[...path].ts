type VercelRequest = { method?: string; url?: string; [key: string]: unknown };
type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => unknown;
  [key: string]: unknown;
};

function safeDetails(error: unknown) {
  if (!(error instanceof Error)) return { message: 'Unknown startup error' };
  return {
    name: error.name,
    message: error.message.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, '[redacted database URL]'),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const [{ app }, { ensureDatabaseSchema }] = await Promise.all([
      import('../src/server/http/app.ts'),
      import('../src/server/infra/db.ts'),
    ]);
    await ensureDatabaseSchema();
    return app(req, res);
  } catch (error) {
    console.error('[vercel-api] request failed', {
      method: req.method,
      url: req.url,
      ...safeDetails(error),
    });
    return res.status(503).json({
      error: 'API_STARTUP_FAILED',
      message: 'API configuration or database initialization failed',
    });
  }
}
