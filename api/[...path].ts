import { app } from '../src/server/http/app.ts';

// Vercel routes requests under /api/* to this serverless function. Exporting the
// existing Express app keeps the API routes in one place for local and Vercel use.
export default app;
