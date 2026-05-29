#!/usr/bin/env tsx
/**
 * Seeds demo incidents + one completed investigation.
 * Usage: pnpm seed:demo  (from monorepo root)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import type { IncidentSummary } from '../packages/types/src/index.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const incidents = [
  {
    pagerduty_id: 'DEMO-001',
    title: 'High error rate on payments-api (>15% 5xx)',
    severity: 'critical',
    status: 'triggered',
    service_name: 'payments-api',
    created_at: new Date(Date.now() - 25 * 60_000).toISOString(),
  },
  {
    pagerduty_id: 'DEMO-002',
    title: 'P95 latency spike on auth-service (>4s)',
    severity: 'high',
    status: 'acknowledged',
    service_name: 'auth-service',
    created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
    assigned_to: 'on-call-eng@acme.io',
  },
  {
    pagerduty_id: 'DEMO-003',
    title: 'Datadog monitor: DB connection pool exhausted',
    severity: 'high',
    status: 'triggered',
    service_name: 'data-pipeline',
    created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
  },
  {
    pagerduty_id: 'DEMO-004',
    title: 'Webhook delivery failures — Stripe integration',
    severity: 'medium',
    status: 'resolved',
    service_name: 'webhook-worker',
    created_at: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
    resolved_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
  },
];

const demoSummary: IncidentSummary = {
  root_cause:
    'A deploy of payments-api v2.14.1 introduced a regression in the Stripe charge retry logic, causing 500 errors when retrying declined cards under high load.',
  confidence: 'high',
  contributing_factors: [
    'Stripe API latency increased ~40% during the same window due to a partial Stripe outage (StatusGator)',
    'Connection pool limit was already at 85% capacity before the deploy',
    'No canary deployment — change rolled out to 100% of pods simultaneously',
  ],
  timeline: [
    {
      timestamp: new Date(Date.now() - 35 * 60_000).toISOString(),
      source: 'github',
      event: 'PR #441 merged: "fix: retry declined cards with exponential backoff"',
      severity: 'info',
    },
    {
      timestamp: new Date(Date.now() - 30 * 60_000).toISOString(),
      source: 'github',
      event: 'payments-api v2.14.1 deployed to production (SHA: a3f9c12)',
      severity: 'info',
    },
    {
      timestamp: new Date(Date.now() - 27 * 60_000).toISOString(),
      source: 'datadog',
      event: 'Error rate crossed 5% threshold — monitor "payments-api 5xx" triggered',
      severity: 'high',
    },
    {
      timestamp: new Date(Date.now() - 26 * 60_000).toISOString(),
      source: 'statusgator',
      event: 'Stripe: Degraded performance on Charges API reported',
      severity: 'medium',
    },
    {
      timestamp: new Date(Date.now() - 25 * 60_000).toISOString(),
      source: 'pagerduty',
      event: 'PagerDuty incident triggered: High error rate on payments-api (>15% 5xx)',
      severity: 'critical',
    },
    {
      timestamp: new Date(Date.now() - 22 * 60_000).toISOString(),
      source: 'datadog',
      event: 'DB connection pool utilisation hit 98% — pool exhaustion imminent',
      severity: 'high',
    },
  ],
  affected_services: ['payments-api', 'checkout-web', 'invoice-service'],
  recent_deploys: [
    {
      repo: 'acme/payments-api',
      sha: 'a3f9c12',
      message: 'fix: retry declined cards with exponential backoff',
      author: 'jane.doe',
      deployed_at: new Date(Date.now() - 30 * 60_000).toISOString(),
      url: 'https://github.com/acme/payments-api/commit/a3f9c12',
    },
  ],
  datadog_anomalies: [
    'payments-api 5xx rate: 0.3% → 17.4% (+5700%) starting 30m ago',
    'P99 response time: 340ms → 6.2s on /v1/charges endpoint',
    'DB connection pool: 72% → 98% utilisation, 12 timeouts in last 5 min',
  ],
  third_party_issues: [
    {
      service: 'Stripe',
      status: 'degraded',
      description: 'Degraded performance on Charges API — increased latency and error rates',
      started_at: new Date(Date.now() - 26 * 60_000).toISOString(),
    },
  ],
  recommended_actions: [
    'Immediately roll back payments-api to v2.13.9 via: kubectl rollout undo deploy/payments-api',
    'Confirm Stripe degradation status at https://status.stripe.com before re-deploying',
    'Increase DB connection pool limit from 100 → 150 in payments-api config as short-term mitigation',
    'Re-review PR #441 retry logic — ensure retries use a circuit breaker pattern, not infinite loops',
    'Add canary deployment step to payments-api CI pipeline to catch regressions on <5% traffic first',
  ],
};

async function seed() {
  console.log('[seed] inserting demo incidents…');

  // Upsert incidents (safe to re-run)
  const { data: insertedIncidents, error: incErr } = await supabase
    .from('incidents')
    .upsert(incidents, { onConflict: 'pagerduty_id', ignoreDuplicates: false })
    .select();

  if (incErr) { console.error('[seed] incidents failed:', incErr.message); process.exit(1); }
  console.log(`[seed] ✓ ${insertedIncidents?.length} incidents`);

  const criticalIncident = insertedIncidents?.find((i) => i.pagerduty_id === 'DEMO-001');
  if (!criticalIncident) { console.error('[seed] DEMO-001 not found'); process.exit(1); }

  // Delete any existing investigation for this incident then re-insert
  await supabase.from('investigations').delete().eq('incident_id', criticalIncident.id);

  const { error: invErr } = await supabase.from('investigations').insert({
    incident_id: criticalIncident.id,
    status: 'complete',
    started_at: new Date(Date.now() - 24 * 60_000).toISOString(),
    completed_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    summary: demoSummary,
  });

  if (invErr) { console.error('[seed] investigation failed:', invErr.message); process.exit(1); }

  console.log('[seed] ✓ demo investigation with full summary');
  console.log('\n[seed] done — visit http://localhost:3000');
}

seed();
