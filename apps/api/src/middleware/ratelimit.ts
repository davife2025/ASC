import type { Context, Next } from 'hono';

// Simple in-process rate limiter — per-IP sliding window
// For production replace with Redis-backed solution

const windows = new Map<string, number[]>();
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60;

export async function rateLimiter(ctx: Context, next: Next): Promise<void> {
  const ip =
    ctx.req.header('x-forwarded-for')?.split(',')[0].trim() ??
    ctx.req.header('x-real-ip') ??
    'unknown';

  const now = Date.now();
  const hits = (windows.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  windows.set(ip, hits);

  ctx.header('X-RateLimit-Limit', String(MAX_REQUESTS));
  ctx.header('X-RateLimit-Remaining', String(Math.max(0, MAX_REQUESTS - hits.length)));

  if (hits.length > MAX_REQUESTS) {
    ctx.json({ data: null, error: 'Rate limit exceeded' }, 429);
    return;
  }

  await next();
}

// Clean up old entries every 5 minutes to avoid memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of windows.entries()) {
    const fresh = hits.filter((t) => now - t < WINDOW_MS);
    if (fresh.length === 0) windows.delete(ip);
    else windows.set(ip, fresh);
  }
}, 5 * 60_000);
