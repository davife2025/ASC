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

router.get(
  '/',
  zValidator(
    'query',
    z.object({
      status:   z.enum(['triggered', 'acknowledged', 'resolved']).optional(),
      severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
      page:     z.coerce.number().int().positive().default(1),
      per_page: z.coerce.number().int().min(1).max(100).default(20),
    }),
  ),
  async (ctx) => {
    const { status, severity, page, per_page } = ctx.req.valid('query');
    const from = (page - 1) * per_page;

    let query = supabase
      .from('incidents')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + per_page - 1);

    if (status)   query = query.eq('status', status);
    if (severity) query = query.eq('severity', severity);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return ctx.json({ data: data as Incident[], total: count ?? 0, page, per_page });
  },
);

// ─── GET /incidents/:id ──────────────────────────────────────────────────────

router.get(
  '/:id',
  zValidator('param', z.object({ id: z.string().uuid() })),
  async (ctx) => {
    const { id } = ctx.req.valid('param');
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return ctx.json({ data: data as Incident });
  },
);

// ─── POST /incidents/sync ────────────────────────────────────────────────────

router.post('/sync', async (ctx) => {
  // Coral may not be available in local dev — return empty sync gracefully
  let result;
  try {
    result = await fetchActiveIncidents();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[incidents/sync] coral unavailable — skipping sync:', msg);
    return ctx.json({ data: { synced: 0, incidents: [], reason: msg } });
  }

  if (result.row_count === 0) {
    return ctx.json({ data: { synced: 0, incidents: [] } });
  }

  const incidents = result.rows.map((row) => ({
    pagerduty_id: String(row.id),
    title:        String(row.title ?? ''),
    severity:     mapUrgencyToSeverity(String(row.urgency ?? 'low')),
    status:       normaliseStatus(String(row.status ?? 'triggered')),
    service_name: String(row.service ?? 'unknown'),
    created_at:   String(row.started_at ?? new Date().toISOString()),
    resolved_at:  row.resolved_at ? String(row.resolved_at) : null,
  }));

  const { data, error } = await supabase
    .from('incidents')
    .upsert(incidents, { onConflict: 'pagerduty_id', ignoreDuplicates: false })
    .select();

  if (error) throw new Error(error.message);

  return ctx.json({ data: { synced: data?.length ?? 0, incidents: data } });
});

// ─── GET /incidents/:id/live ─────────────────────────────────────────────────

router.get(
  '/:id/live',
  zValidator('param', z.object({ id: z.string().uuid() })),
  async (ctx) => {
    const { id } = ctx.req.valid('param');
    const { data: incident, error: dbErr } = await supabase
      .from('incidents')
      .select('pagerduty_id')
      .eq('id', id)
      .single();

    if (dbErr) throw new Error(dbErr.message);

    // Coral may not be available in local dev — return nulls gracefully
    let detail;
    let logEntries;
    try {
      [detail, logEntries] = await Promise.all([
        fetchIncidentDetail(incident.pagerduty_id),
        fetchIncidentLogEntries(incident.pagerduty_id),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[incidents/:id/live] coral unavailable:', msg);
      return ctx.json({
        data: { incident: null, log_entries: [], reason: msg },
      });
    }

    return ctx.json({
      data: { incident: detail.rows[0] ?? null, log_entries: logEntries.rows },
    });
  },
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapUrgencyToSeverity(urgency: string): Incident['severity'] {
  const map: Record<string, Incident['severity']> = {
    critical: 'critical',
    high:     'high',
    medium:   'medium',
    low:      'low',
    p1:       'critical',
    p2:       'high',
    p3:       'medium',
    p4:       'low',
  };
  return map[urgency.toLowerCase()] ?? 'low';
}

function normaliseStatus(status: string): Incident['status'] {
  const map: Record<string, Incident['status']> = {
    triggered:    'triggered',
    acknowledged: 'acknowledged',
    resolved:     'resolved',
  };
  return map[status.toLowerCase()] ?? 'triggered';
}

export { router as incidentsRouter };


