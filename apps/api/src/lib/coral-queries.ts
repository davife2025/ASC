import { coral } from './coral.js';
import type { CoralQueryResult } from '@sre/types';

// ─── PagerDuty ───────────────────────────────────────────────────────────────

export function fetchActiveIncidents(): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT id, title, urgency, status, service, started_at, resolved_at,
           html_url, summary
    FROM pagerduty.incidents
    WHERE status IN ('triggered', 'acknowledged')
      AND urgency = 'high'
    ORDER BY started_at DESC
    LIMIT 50
  `);
}

export function fetchIncidentDetail(pagerdutyId: string): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT id, title, urgency, status, service, started_at, resolved_at,
           html_url, summary, first_trigger_log_entry
    FROM pagerduty.incidents
    WHERE id = '${esc(pagerdutyId)}'
    LIMIT 1
  `);
}

export function fetchIncidentLogEntries(pagerdutyId: string): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT id, type, summary, created_at, channel_type
    FROM pagerduty.log_entries
    WHERE incident = '${esc(pagerdutyId)}'
    ORDER BY created_at DESC
    LIMIT 30
  `);
}

export function fetchRecentChangeEvents(): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT id, routing_key, summary, timestamp, links, custom_details
    FROM pagerduty.change_events
    ORDER BY timestamp DESC
    LIMIT 20
  `);
}

// ─── Datadog ─────────────────────────────────────────────────────────────────

export function fetchFiringMonitors(): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT id, name, status, query, message, tags, priority,
           created, modified, overall_state
    FROM datadog.monitors
    WHERE overall_state IN ('Alert', 'Warn', 'No Data')
    ORDER BY modified DESC
    LIMIT 30
  `);
}

export function fetchRecentDatadogEvents(windowMinutes = 120): Promise<CoralQueryResult> {
  // FIX: clamp to safe integer range before interpolating
  const mins = Math.min(Math.max(Math.floor(windowMinutes), 1), 1440);
  return coral.query(`
    SELECT id, title, text, date_happened, priority, alert_type, tags, source
    FROM datadog.events
    WHERE date_happened > NOW() - INTERVAL '${mins} minutes'
      AND alert_type IN ('error', 'warning')
    ORDER BY date_happened DESC
    LIMIT 50
  `);
}

export function fetchServiceHealth(): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT service_name, env, overall_health, p50, p95, p99,
           error_rate, requests_per_second
    FROM datadog.service_health
    ORDER BY error_rate DESC NULLS LAST
    LIMIT 30
  `);
}

export function fetchDatadogIncidents(): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT id, title, status, severity, created, modified,
           customer_impact_scope, customer_impact_start, customer_impact_end
    FROM datadog.incidents
    WHERE status != 'resolved'
    ORDER BY created DESC
    LIMIT 20
  `);
}

// ─── GitHub ──────────────────────────────────────────────────────────────────

export function fetchRecentMergedPRs(
  owner: string,
  repo: string,
  windowHours = 6,
): Promise<CoralQueryResult> {
  const hrs = Math.min(Math.max(Math.floor(windowHours), 1), 72);
  return coral.query(`
    SELECT number, title, state, merged_at, head_sha, head_ref, base_ref,
           user_login, html_url, additions, deletions, changed_files
    FROM github.pulls
    WHERE owner = '${esc(owner)}'
      AND repo  = '${esc(repo)}'
      AND state = 'closed'
      AND merged_at > NOW() - INTERVAL '${hrs} hours'
    ORDER BY merged_at DESC
    LIMIT 20
  `);
}

export function fetchRecentCommits(
  owner: string,
  repo: string,
  windowHours = 6,
): Promise<CoralQueryResult> {
  const hrs = Math.min(Math.max(Math.floor(windowHours), 1), 72);
  return coral.query(`
    SELECT sha, message, author_name, author_email, committer_date, html_url
    FROM github.commits
    WHERE owner = '${esc(owner)}'
      AND repo  = '${esc(repo)}'
      AND ref   = 'main'
      AND committer_date > NOW() - INTERVAL '${hrs} hours'
    ORDER BY committer_date DESC
    LIMIT 30
  `);
}

export function fetchFailedWorkflows(owner: string, repo: string): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT id, name, status, conclusion, head_sha, head_branch,
           created_at, updated_at, html_url
    FROM github.workflow_runs
    WHERE owner      = '${esc(owner)}'
      AND repo       = '${esc(repo)}'
      AND conclusion IN ('failure', 'cancelled', 'timed_out')
      AND created_at > NOW() - INTERVAL '6 hours'
    ORDER BY created_at DESC
    LIMIT 10
  `);
}

// ─── StatusGator ─────────────────────────────────────────────────────────────

export function fetchThirdPartyIncidents(): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT id, service_name, title, status, impact, started_at, updated_at,
           url, affected_components
    FROM statusgator.incidents
    WHERE status != 'resolved'
    ORDER BY started_at DESC
    LIMIT 30
  `);
}

export function fetchRecentThirdPartyIncidents(windowHours = 24): Promise<CoralQueryResult> {
  const hrs = Math.min(Math.max(Math.floor(windowHours), 1), 168);
  return coral.query(`
    SELECT id, service_name, title, status, impact, started_at, resolved_at,
           url, affected_components
    FROM statusgator.incidents
    WHERE started_at > NOW() - INTERVAL '${hrs} hours'
    ORDER BY started_at DESC
    LIMIT 50
  `);
}

export function fetchServiceComponentStatus(): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT service_name, component_name, status, updated_at
    FROM statusgator.service_components
    WHERE status != 'operational'
    ORDER BY updated_at DESC
    LIMIT 50
  `);
}

// ─── Cross-source correlation ─────────────────────────────────────────────────

export function correlateIncidentsWithMonitors(): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT
      p.id          AS pd_incident_id,
      p.title       AS pd_title,
      p.service     AS pd_service,
      p.started_at,
      p.urgency,
      d.name        AS monitor_name,
      d.status      AS monitor_status,
      d.tags        AS monitor_tags
    FROM pagerduty.incidents p
    LEFT JOIN datadog.monitors d
      ON d.tags LIKE '%service:' || p.service || '%'
    WHERE p.status IN ('triggered', 'acknowledged')
      AND p.urgency = 'high'
      AND d.overall_state IN ('Alert', 'Warn')
    ORDER BY p.started_at DESC
    LIMIT 20
  `);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Escape single quotes for SQL string interpolation */
function esc(value: string): string {
  return value.replace(/'/g, "''");
}
