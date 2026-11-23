import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import { app } from './src/server/http/app.ts';
import { attachSocket } from './src/server/socket/socket.ts';
import { env } from './src/server/config/env.ts';
import { startTimeoutScheduler } from './src/server/services/scheduler.service.ts';

async function startServer() {
  const server = createServer(app);
  const io = attachSocket(server);
  const stopScheduler = startTimeoutScheduler(5000);

  if (env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found');
      }
    });
  }

  server.listen(env.PORT, '0.0.0.0', () => {
    console.log(`Grand Estate Monopoly server listening on http://0.0.0.0:${env.PORT}`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down`);
    stopScheduler();
    const forceTimer = setTimeout(() => process.exit(1), 10_000);
    await new Promise<void>((resolve) => io.close(() => resolve()));
    server.close(() => {
      clearTimeout(forceTimer);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void startServer();
