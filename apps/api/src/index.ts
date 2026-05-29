import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import { router } from './routes/index.js';
import { startWorker, recoverStuckInvestigations } from './lib/worker.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({ origin: '*' }));
app.use('*', errorHandler);

app.route('/api', router);

serve({ fetch: app.fetch, port: env.port }, async () => {
  console.log(`[api] running on http://localhost:${env.port}`);

  // Recover investigations left in "running" by a previous crashed process
  await recoverStuckInvestigations();

  // Start background worker
  startWorker();
});
