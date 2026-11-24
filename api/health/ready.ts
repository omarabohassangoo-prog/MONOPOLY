import { ensureDatabaseSchema, checkDbHealth } from '../../src/server/infra/db.ts';

export default async function handler(_req: unknown, res: { status: (code: number) => any; json: (body: unknown) => unknown }) {
  try {
    await ensureDatabaseSchema();
    const database = await checkDbHealth();
    return res.status(200).json({ ok: true, database });
  } catch (error) {
    console.error('[health-ready] database failed', error instanceof Error ? error.message : error);
    return res.status(503).json({ ok: false, database: false });
  }
}
