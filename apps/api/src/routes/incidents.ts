import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import {
  fetchActiveIncidents,
  fetchIncidentDetail,
  fetchIncidentLogEntries,
} from '../lib/coral-queries.js';
import type { Incident } from '@sre/types';

const router = new Hono();

// ─── GET /incidents ──────────────────────────────────────────────────────────
// Returns stored incidents from Supabase (fast, paginated)

router.get(
  '/',
  zValidator(
    'query',
    z.object({
      status: z.enum(['triggered', 'acknowledged', 'resolved']).optional(),
      severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
      page: z.coerce.number().int().positive().default(1),
      per_page: z.coerce.number().int().min(1).max(100).default(20),
    })
  ),
  async (ctx) => {
    const { status, severity, page, per_page } = ctx.req.valid('query');
    const from = (page - 1) * per_page;

    let query = supabase
      .from('incidents')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + per_page - 1);

    if (status) query = query.eq('status', status);
    if (severity) query = query.eq('severity', severity);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return ctx.json({
      data: data as Incident[],
      total: count ?? 0,
      page,
      per_page,
    });
  }
);

// ─── GET /incidents/:id ──────────────────────────────────────────────────────

router.get('/:id', async (ctx) => {
  const id = ctx.req.param('id');
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return ctx.json({ data });
});

// ─── POST /incidents/sync ────────────────────────────────────────────────────
// Pull active high-urgency incidents from PagerDuty via Coral and upsert into Supabase

router.post('/sync', async (ctx) => {
  const result = await fetchActiveIncidents();

  if (result.row_count === 0) {
    return ctx.json({ data: { synced: 0, incidents: [] } });
  }

  const incidents = result.rows.map((row) => ({
    pagerduty_id: String(row.id),
    title: String(row.title ?? ''),
    severity: mapUrgencyToSeverity(String(row.urgency ?? 'low')),
    status: String(row.status ?? 'triggered') as Incident['status'],
    service_name: String(row.service ?? 'unknown'),
    created_at: String(row.started_at ?? new Date().toISOString()),
    resolved_at: row.resolved_at ? String(row.resolved_at) : null,
  }));

  const { data, error } = await supabase
    .from('incidents')
    .upsert(incidents, { onConflict: 'pagerduty_id', ignoreDuplicates: false })
    .select();

  if (error) throw new Error(error.message);

  return ctx.json({ data: { synced: data?.length ?? 0, incidents: data } });
});

// ─── GET /incidents/:id/live ─────────────────────────────────────────────────
// Fetch live incident data direct from PagerDuty via Coral (not cached)

router.get('/:id/live', async (ctx) => {
  const id = ctx.req.param('id');

  // Resolve pagerduty_id from our DB first
  const { data: incident, error: dbErr } = await supabase
    .from('incidents')
    .select('pagerduty_id')
    .eq('id', id)
    .single();

  if (dbErr) throw new Error(dbErr.message);

  const [detail, logEntries] = await Promise.all([
    fetchIncidentDetail(incident.pagerduty_id),
    fetchIncidentLogEntries(incident.pagerduty_id),
  ]);

  return ctx.json({
    data: {
      incident: detail.rows[0] ?? null,
      log_entries: logEntries.rows,
    },
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapUrgencyToSeverity(urgency: string): Incident['severity'] {
  return urgency === 'high' ? 'high' : 'low';
}

export { router as incidentsRouter };
