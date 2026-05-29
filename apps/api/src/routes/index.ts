import { Hono } from 'hono';
import { incidentsRouter } from './incidents.js';
import { investigationsRouter } from './investigations.js';
import { coralRouter } from './coral.js';
import { webhooksRouter } from './webhooks.js';

const router = new Hono();

router.get('/health', (ctx) => ctx.json({ status: 'ok', ts: new Date().toISOString() }));

router.route('/incidents', incidentsRouter);
router.route('/investigations', investigationsRouter);
router.route('/coral', coralRouter);
router.route('/webhooks', webhooksRouter);

export { router };
