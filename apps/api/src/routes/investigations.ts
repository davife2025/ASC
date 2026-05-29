import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { runInvestigation } from '../lib/agent.js';
import type { Investigation } from '@sre/types';

const router = new Hono();

// ─── GET /investigations ─────────────────────────────────────────────────────

router.get(
  '/',
  zValidator(
    'query',
    z.object({
      incident_id: z.string().uuid().optional(),
      status: z.enum(['pending', 'running', 'complete', 'failed']).optional(),
      page: z.coerce.number().int().positive().default(1),
      per_page: z.coerce.number().int().min(1).max(50).default(10),
    })
  ),
  async (ctx) => {
    const { incident_id, status, page, per_page } = ctx.req.valid('query');
    const from = (page - 1) * per_page;

    let query = supabase
      .from('investigations')
      .select('*', { count: 'exact' })
      .order('started_at', { ascending: false })
      .range(from, from + per_page - 1);

    if (incident_id) query = query.eq('incident_id', incident_id);
    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return ctx.json({ data: data as Investigation[], total: count ?? 0, page, per_page });
  }
);

// ─── GET /investigations/:id ─────────────────────────────────────────────────

router.get('/:id', async (ctx) => {
  const { data, error } = await supabase
    .from('investigations')
    .select('*')
    .eq('id', ctx.req.param('id'))
    .single();

  if (error) throw new Error(error.message);
  return ctx.json({ data: data as Investigation });
});

// ─── POST /investigations ────────────────────────────────────────────────────

router.post(
  '/',
  zValidator('json', z.object({ incident_id: z.string().uuid() })),
  async (ctx) => {
    const { incident_id } = ctx.req.valid('json');

    // Verify incident exists
    const { error: incErr } = await supabase
      .from('incidents')
      .select('id')
      .eq('id', incident_id)
      .single();

    if (incErr) throw new Error(`Incident not found: ${incErr.message}`);

    // Return existing active investigation if any
    const { data: existing } = await supabase
      .from('investigations')
      .select('*')
      .eq('incident_id', incident_id)
      .in('status', ['pending', 'running'])
      .maybeSingle();

    if (existing) return ctx.json({ data: existing as Investigation }, 200);

    // Create and immediately dispatch
    const { data, error } = await supabase
      .from('investigations')
      .insert({ incident_id, status: 'pending', started_at: new Date().toISOString() })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Fire-and-forget — worker also picks this up if API restarts mid-run
    setImmediate(() => runInvestigation(data.id));

    return ctx.json({ data: data as Investigation }, 201);
  }
);

// ─── POST /investigations/:id/retry ─────────────────────────────────────────

router.post('/:id/retry', async (ctx) => {
  const id = ctx.req.param('id');

  const { data: inv, error } = await supabase
    .from('investigations')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  if (inv.status === 'running') throw new Error('Investigation already running');

  // Reset to pending
  await supabase
    .from('investigations')
    .update({ status: 'pending', error: null, summary: null, raw_data: null })
    .eq('id', id);

  setImmediate(() => runInvestigation(id));

  return ctx.json({ data: { id, status: 'pending' } });
});

export { router as investigationsRouter };
