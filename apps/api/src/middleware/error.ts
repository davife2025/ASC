import type { Context, Next } from 'hono';

export async function errorHandler(ctx: Context, next: Next): Promise<void> {
  try {
    await next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[error]', err);
    ctx.json({ data: null, error: message }, 500);
  }
}
