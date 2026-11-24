import { checkDbHealth } from '../../src/server/infra/db.ts';

type Request = { method?: string; url?: string };
type Response = {
  status: (code: number) => Response;
  json: (body: unknown) => unknown;
};

export default async function handler(_req: Request, res: Response) {
  try {
    const database = await checkDbHealth();
    return res.status(database ? 200 : 503).json({ ok: database, database });
  } catch (error) {
    console.error('[health-ready] database check failed', {
      error: error instanceof Error ? error.message : 'Unknown database error',
    });
    return res.status(503).json({ ok: false, database: false });
  }
}
