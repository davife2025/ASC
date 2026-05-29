import { coral } from './coral.js';
import type { CoralQueryResult } from '@sre/types';

// ─── PagerDuty ───────────────────────────────────────────────────────────────

/** Active high-urgency incidents */
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

/** Single incident detail + recent log entries */
export function fetchIncidentDetail(pagerdutyId: string): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT id, title, urgency, status, service, started_at, resolved_at,
           html_url, summary, first_trigger_log_entry
    FROM pagerduty.incidents
    WHERE id = '${escape(pagerdutyId)}'
    LIMIT 1
  `);
}

/** Log entries for an incident (timeline of actions) */
export function fetchIncidentLogEntries(pagerdutyId: string): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT id, type, summary, created_at, channel_type
    FROM pagerduty.log_entries
    WHERE incident = '${escape(pagerdutyId)}'
    ORDER BY created_at DESC
    LIMIT 30
  `);
}

/** Recent change events (deploys / config changes) from PagerDuty */
export function fetchRecentChangeEvents(): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT id, routing_key, summary, timestamp, links, custom_details
    FROM pagerduty.change_events
    ORDER BY timestamp DESC
    LIMIT 20
  `);
}

// ─── Datadog ─────────────────────────────────────────────────────────────────

/** Monitors currently in alert/warn state */
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

/** Recent Datadog events in the last N minutes */
export function fetchRecentDatadogEvents(windowMinutes = 120): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT id, title, text, date_happened, priority, alert_type, tags, source
    FROM datadog.events
    WHERE date_happened > NOW() - INTERVAL '${windowMinutes} minutes'
      AND alert_type IN ('error', 'warning')
    ORDER BY date_happened DESC
    LIMIT 50
  `);
}

/** Service health overview */
export function fetchServiceHealth(): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT service_name, env, overall_health, p50, p95, p99,
           error_rate, requests_per_second
    FROM datadog.service_health
    ORDER BY error_rate DESC NULLS LAST
    LIMIT 30
  `);
}

/** Active Datadog incidents */
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

/** Recent merged PRs for a repo (potential deploys) */
export function fetchRecentMergedPRs(
  owner: string,
  repo: string,
  windowHours = 6
): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT number, title, state, merged_at, head_sha, head_ref, base_ref,
           user_login, html_url, additions, deletions, changed_files
    FROM github.pulls
    WHERE owner = '${escape(owner)}'
      AND repo = '${escape(repo)}'
      AND state = 'closed'
      AND merged_at > NOW() - INTERVAL '${windowHours} hours'
    ORDER BY merged_at DESC
    LIMIT 20
  `);
}

/** Recent commits to main/master */
export function fetchRecentCommits(
  owner: string,
  repo: string,
  windowHours = 6
): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT sha, message, author_name, author_email, committer_date, html_url
    FROM github.commits
    WHERE owner = '${escape(owner)}'
      AND repo = '${escape(repo)}'
      AND ref = 'main'
      AND committer_date > NOW() - INTERVAL '${windowHours} hours'
    ORDER BY committer_date DESC
    LIMIT 30
  `);
}

/** Failed or cancelled workflow runs */
export function fetchFailedWorkflows(owner: string, repo: string): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT id, name, status, conclusion, head_sha, head_branch,
           created_at, updated_at, html_url
    FROM github.workflow_runs
    WHERE owner = '${escape(owner)}'
      AND repo = '${escape(repo)}'
      AND conclusion IN ('failure', 'cancelled', 'timed_out')
      AND created_at > NOW() - INTERVAL '6 hours'
    ORDER BY created_at DESC
    LIMIT 10
  `);
}

// ─── StatusGator ─────────────────────────────────────────────────────────────

/** Active third-party incidents */
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

/** Recent StatusGator incidents in the last 24h (resolved too) */
export function fetchRecentThirdPartyIncidents(windowHours = 24): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT id, service_name, title, status, impact, started_at, resolved_at,
           url, affected_components
    FROM statusgator.incidents
    WHERE started_at > NOW() - INTERVAL '${windowHours} hours'
    ORDER BY started_at DESC
    LIMIT 50
  `);
}

/** Component status overview for monitored services */
export function fetchServiceComponentStatus(): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT service_name, component_name, status, updated_at
    FROM statusgator.service_components
    WHERE status != 'operational'
    ORDER BY updated_at DESC
    LIMIT 50
  `);
}

// ─── Cross-source correlation ────────────────────────────────────────────────

/**
 * Correlate PagerDuty incidents with Datadog monitors.
 * Joins on service name to find monitors that fired around incident time.
 */
export function correlateIncidentsWithMonitors(): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT
      p.id AS pd_incident_id,
      p.title AS pd_title,
      p.service AS pd_service,
      p.started_at,
      p.urgency,
      d.name AS monitor_name,
      d.status AS monitor_status,
      d.tags AS monitor_tags
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

/** Basic SQL injection guard for interpolated values */
function escape(value: string): string {
  return value.replace(/'/g, "''");
}
