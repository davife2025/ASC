import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { coral } from '../lib/coral.js';

const router = new Hono();

// ─── GET /coral/health ───────────────────────────────────────────────────────
// Uses list_catalog MCP tool — correct way to introspect Coral schema

router.get('/health', async (ctx) => {
  try {
    const items = await coral.listCatalog();
    const schemas = [...new Set(items.map((i) => i.schema))].sort();

    return ctx.json({
      data: {
        status: 'connected',
        schemas,
        table_count: items.length,
        tables: items,
      },
    });
  } catch (err) {
    return ctx.json(
      {
        data: {
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
          hint: 'Run `pnpm setup:coral` to register sources',
        },
      },
      503,
    );
  }
});

// ─── GET /coral/sources ──────────────────────────────────────────────────────

router.get('/sources', async (ctx) => {
  const items = await coral.listCatalog();
  const schemas = [...new Set(items.map((i) => i.schema))].sort();
  return ctx.json({ data: schemas });
});

// ─── GET /coral/tables/:schema ────────────────────────────────────────────────

router.get(
  '/tables/:schema',
  zValidator('param', z.object({ schema: z.string().min(1).max(50) })),
  async (ctx) => {
    const { schema } = ctx.req.valid('param');
    const items = await coral.listCatalog(schema);
    return ctx.json({ data: items });
  },
);

// ─── POST /coral/query ────────────────────────────────────────────────────────
// Dev/debug endpoint — run arbitrary read-only SQL against Coral

router.post(
  '/query',
  zValidator('json', z.object({ sql: z.string().min(1).max(5000) })),
  async (ctx) => {
    const { sql } = ctx.req.valid('json');
    const result = await coral.query(sql);
    return ctx.json({ data: result });
  },
);

export { router as coralRouter };
