import { Hono } from 'hono';
import { coral } from '../lib/coral.js';

const router = new Hono();

// ─── GET /coral/health ───────────────────────────────────────────────────────

router.get('/health', async (ctx) => {
  try {
    const result = await coral.query(
      `SELECT schema_name, table_name FROM coral.tables ORDER BY 1, 2 LIMIT 100`
    );
    return ctx.json({
      data: {
        status: 'connected',
        tables: result.rows,
        table_count: result.row_count,
      },
    });
  } catch (err) {
    return ctx.json(
      {
        data: {
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        },
      },
      503
    );
  }
});

// ─── GET /coral/sources ──────────────────────────────────────────────────────

router.get('/sources', async (ctx) => {
  const result = await coral.query(
    `SELECT DISTINCT schema_name FROM coral.tables ORDER BY 1`
  );
  return ctx.json({ data: result.rows });
});

export { router as coralRouter };
