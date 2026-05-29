import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import { rateLimiter } from './middleware/ratelimit.js';
import { router } from './routes/index.js';
import { startWorker, recoverStuckInvestigations } from './lib/worker.js';
import { validateCoralSchema } from './lib/coral-validate.js';

const app = new Hono();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin:
      env.nodeEnv === 'production'
        ? env.webOrigin  // e.g. https://sre-investigator.vercel.app
        : '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  })
);
app.use('*', rateLimiter);
app.use('*', errorHandler);

app.route('/api', router);

serve({ fetch: app.fetch, port: env.port }, async () => {
  console.log(`[api] running on http://localhost:${env.port} (${env.nodeEnv})`);

  // Validate Coral table names match what we query
  await validateCoralSchema();

  // Recover any investigations stuck in "running" from a previous crashed process
  await recoverStuckInvestigations();

  // Start background worker
  startWorker();
});
