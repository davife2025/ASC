import { Hono } from 'hono';
import { incidentsRouter } from './incidents.js';
import { investigationsRouter } from './investigations.js';
import { coralRouter } from './coral.js';

const router = new Hono();

router.get('/health', (ctx) => ctx.json({ status: 'ok' }));

router.route('/incidents', incidentsRouter);
router.route('/investigations', investigationsRouter);
router.route('/coral', coralRouter);

export { router };
