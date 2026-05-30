import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import { rateLimiter } from './middleware/ratelimit.js';
import { router } from './routes/index.js';
import { startWorker, recoverStuckInvestigations, gracefulShutdown } from './lib/worker.js';
import { validateCoralSchema } from './lib/coral-validate.js';

const app = new Hono();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: env.nodeEnv === 'production' ? env.webOrigin : '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
);
app.use('*', rateLimiter);
app.use('*', errorHandler);
app.route('/api', router);

const server = serve({ fetch: app.fetch, port: env.port }, async () => {
  console.log(`[api] running on http://localhost:${env.port} (${env.nodeEnv})`);

  try {
    await validateCoralSchema();
  } catch (err) {
    console.warn('[api] coral not available — skipping schema validation:', (err as Error).message);
  }

  await recoverStuckInvestigations();
  startWorker();
});

// ─── Graceful shutdown ──────────────────────────────────────────────────────
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] received ${signal} — shutting down`);

  // Stop accepting new requests
  server.close(() => console.log('[api] HTTP server closed'));

  // Drain active investigations + disconnect coral
  await gracefulShutdown(15_000);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[api] uncaught exception:', err);
  shutdown('uncaughtException').finally(() => process.exit(1));
});
process.on('unhandledRejection', (reason) => {
  console.error('[api] unhandled rejection:', reason);
});