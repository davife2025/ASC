import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
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

    return ctx.json({
      data: data as Investigation[],
      total: count ?? 0,
      page,
      per_page,
    });
  }
);

// ─── GET /investigations/:id ─────────────────────────────────────────────────

router.get('/:id', async (ctx) => {
  const id = ctx.req.param('id');
  const { data, error } = await supabase
    .from('investigations')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return ctx.json({ data: data as Investigation });
});

// ─── POST /investigations ────────────────────────────────────────────────────
// Trigger a new investigation for an incident. Agent logic runs in Session 3.

router.post(
  '/',
  zValidator('json', z.object({ incident_id: z.string().uuid() })),
  async (ctx) => {
    const { incident_id } = ctx.req.valid('json');

    // Verify incident exists
    const { data: incident, error: incErr } = await supabase
      .from('incidents')
      .select('id, status')
      .eq('id', incident_id)
      .single();

    if (incErr) throw new Error(`Incident not found: ${incErr.message}`);

    // Check no active investigation already running
    const { data: existing } = await supabase
      .from('investigations')
      .select('id, status')
      .eq('incident_id', incident_id)
      .in('status', ['pending', 'running'])
      .single();

    if (existing) {
      return ctx.json({ data: existing as Investigation }, 200);
    }

    // Create investigation record in pending state
    const { data, error } = await supabase
      .from('investigations')
      .insert({
        incident_id,
        status: 'pending',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Fire-and-forget: agent will pick this up (Session 3)
    // triggerInvestigationAgent(data.id) — wired in Session 3

    return ctx.json({ data: data as Investigation }, 201);
  }
);

export { router as investigationsRouter };
