import { Hono } from 'hono';
import { supabase } from '../lib/supabase.js';
import { runInvestigation } from '../lib/agent.js';
import type { Incident } from '@sre/types';

const router = new Hono();

/**
 * PagerDuty webhook V3 endpoint.
 * Configure in PagerDuty: Integrations → Generic Webhooks (V3)
 * URL: https://your-api/api/webhooks/pagerduty
 * Events: incident.triggered, incident.acknowledged, incident.resolved
 */
router.post('/pagerduty', async (ctx) => {
  const payload = await ctx.req.json<{
    event: {
      event_type: string;
      data: {
        id: string;
        title: string;
        urgency: string;
        status: string;
        service: { name: string };
        created_at: string;
        resolved_at?: string;
        assignees?: Array<{ summary: string }>;
      };
    };
  }>();

  const { event_type, data } = payload.event;

  // Map PagerDuty status
  const statusMap: Record<string, Incident['status']> = {
    'incident.triggered': 'triggered',
    'incident.acknowledged': 'acknowledged',
    'incident.resolved': 'resolved',
  };

  const status = statusMap[event_type];
  if (!status) return ctx.json({ ok: true }); // ignore other event types

  const incident = {
    pagerduty_id: data.id,
    title: data.title,
    severity: data.urgency === 'high' ? 'high' : ('low' as Incident['severity']),
    status,
    service_name: data.service?.name ?? 'unknown',
    created_at: data.created_at,
    resolved_at: data.resolved_at ?? null,
    assigned_to: data.assignees?.[0]?.summary ?? null,
  };

  // Upsert incident
  const { data: upserted, error } = await supabase
    .from('incidents')
    .upsert(incident, { onConflict: 'pagerduty_id' })
    .select()
    .single();

  if (error) {
    console.error('[webhook] incident upsert failed:', error.message);
    return ctx.json({ ok: false, error: error.message }, 500);
  }

  // Auto-investigate on new high-urgency triggered incidents
  if (event_type === 'incident.triggered' && data.urgency === 'high') {
    const { data: existing } = await supabase
      .from('investigations')
      .select('id')
      .eq('incident_id', upserted.id)
      .in('status', ['pending', 'running'])
      .maybeSingle();

    if (!existing) {
      const { data: inv } = await supabase
        .from('investigations')
        .insert({ incident_id: upserted.id, status: 'pending', started_at: new Date().toISOString() })
        .select()
        .single();

      if (inv) {
        console.log(`[webhook] auto-triggering investigation for incident ${upserted.id}`);
        setImmediate(() => runInvestigation(inv.id));
      }
    }
  }

  return ctx.json({ ok: true });
});

export { router as webhooksRouter };
