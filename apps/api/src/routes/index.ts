import { Hono } from 'hono';

const router = new Hono();

// Mounted in Session 2: /incidents
// Mounted in Session 3: /investigations

router.get('/health', (ctx) => ctx.json({ status: 'ok' }));

export { router };
