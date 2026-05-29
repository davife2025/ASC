import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'crypto';
import { supabase } from '../lib/supabase.js';
import { runInvestigation } from '../lib/agent.js';
import { env } from '../config/env.js';
import type { Incident } from '@sre/types';

const router = new Hono();

/**
 * PagerDuty webhook V3 endpoint.
 * Configure in PagerDuty: Integrations → Generic Webhooks (V3)
 * URL: https://your-api/api/webhooks/pagerduty
 * Events: incident.triggered, incident.acknowledged, incident.resolved
 *
 * Add your webhook secret to .env as PAGERDUTY_WEBHOOK_SECRET.
 * If not set, signature verification is skipped (dev mode).
 */
router.post('/pagerduty', async (ctx) => {
  const rawBody = await ctx.req.text();

  // ─── Signature verification ─────────────────────────────────────────────
  if (env.pagerdutyWebhookSecret) {
    const signature = ctx.req.header('x-pagerduty-signature') ?? '';
    if (!verifyPagerDutySignature(rawBody, signature, env.pagerdutyWebhookSecret)) {
      console.warn('[webhook] invalid PagerDuty signature — rejecting');
      return ctx.json({ ok: false, error: 'Invalid signature' }, 401);
    }
  } else if (env.nodeEnv === 'production') {
    console.error('[webhook] PAGERDUTY_WEBHOOK_SECRET not set in production!');
    return ctx.json({ ok: false, error: 'Webhook secret not configured' }, 500);
  }

  // ─── Parse payload ───────────────────────────────────────────────────────
  let payload: {
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
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return ctx.json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const { event_type, data } = payload.event ?? {};
  if (!event_type || !data) return ctx.json({ ok: false, error: 'Missing event data' }, 400);

  const statusMap: Record<string, Incident['status']> = {
    'incident.triggered':    'triggered',
    'incident.acknowledged': 'acknowledged',
    'incident.resolved':     'resolved',
  };

  const status = statusMap[event_type];
  if (!status) return ctx.json({ ok: true }); // ignore other event types

  // ─── Upsert incident ────────────────────────────────────────────────────
  const incident = {
    pagerduty_id: data.id,
    title:        data.title,
    severity:     mapUrgency(data.urgency),
    status,
    service_name: data.service?.name ?? 'unknown',
    created_at:   data.created_at,
    resolved_at:  data.resolved_at ?? null,
    assigned_to:  data.assignees?.[0]?.summary ?? null,
  };

  const { data: upserted, error } = await supabase
    .from('incidents')
    .upsert(incident, { onConflict: 'pagerduty_id' })
    .select()
    .single();

  if (error) {
    console.error('[webhook] upsert failed:', error.message);
    return ctx.json({ ok: false, error: error.message }, 500);
  }

  // ─── Auto-investigate high-urgency triggered incidents ─────────────────
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
        .insert({
          incident_id: upserted.id,
          status:      'pending',
          started_at:  new Date().toISOString(),
        })
        .select()
        .single();

      if (inv) {
        console.log(`[webhook] auto-investigating incident ${upserted.id}`);
        setImmediate(() => runInvestigation(inv.id));
      }
    }
  }

  return ctx.json({ ok: true });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * PagerDuty V3 webhook signature: HMAC-SHA256 over raw body.
 * Header format: "v1=<hex_digest>"
 */
function verifyPagerDutySignature(body: string, header: string, secret: string): boolean {
  try {
    const signatures = header.split(',').map((s) => s.trim());
    const expected = createHmac('sha256', secret).update(body, 'utf8').digest('hex');
    const expectedBuf = Buffer.from(`v1=${expected}`, 'utf8');

    return signatures.some((sig) => {
      try {
        const sigBuf = Buffer.from(sig, 'utf8');
        return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function mapUrgency(urgency: string): Incident['severity'] {
  const map: Record<string, Incident['severity']> = {
    critical: 'critical', high: 'high', medium: 'medium', low: 'low',
  };
  return map[urgency?.toLowerCase()] ?? 'low';
}

export { router as webhooksRouter };
