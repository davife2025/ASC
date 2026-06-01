import { coral } from './coral.js';
import type { CoralQueryResult } from '@sre/types';

// ─── PagerDuty ────────────────────────────────────────────────────────────────

export function fetchActiveIncidents(): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT id, title, urgency, status, service, started_at, resolved_at, html_url, summary
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

// ─── Grafana (replaces Datadog — free forever on Grafana Cloud) ───────────────

/** Alert rules currently in firing/alerting state */
export function fetchFiringAlertRules(): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT uid, title, state, health, folder_uid,
           updated, labels, annotations
    FROM grafana.alert_rules
    WHERE state IN ('firing', 'alerting', 'error', 'nodata')
    ORDER BY updated DESC
    LIMIT 30
  `);
}

/** Recent alert annotations — events fired by Grafana alerts */
export function fetchRecentAlertAnnotations(windowMinutes = 180): Promise<CoralQueryResult> {
  const mins = Math.min(Math.max(Math.floor(windowMinutes), 1), 1440);
  return coral.query(`
    SELECT id, alert_id, dashboard_id, panel_id, text, tags,
           time, time_end
    FROM grafana.annotations
    WHERE time > NOW() - INTERVAL '${mins} minutes'
      AND alert_id IS NOT NULL
    ORDER BY time DESC
    LIMIT 50
  `);
}

/** All configured datasources — shows what's connected */
export function fetchDatasources(): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT id, uid, name, type, url, access, is_default, json_data
    FROM grafana.datasources
    ORDER BY is_default DESC, name ASC
    LIMIT 20
  `);
}

/** All alert rules regardless of state — for service health overview */
export function fetchAllAlertRules(): Promise<CoralQueryResult> {
  return coral.query(`
    SELECT uid, title, state, health, folder_uid, updated, labels
    FROM grafana.alert_rules
    ORDER BY updated DESC
    LIMIT 50
  `);
}

// ─── GitHub ───────────────────────────────────────────────────────────────────

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
    WHERE owner     = '${esc(owner)}'
      AND repo      = '${esc(repo)}'
      AND state     = 'closed'
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
    WHERE owner          = '${esc(owner)}'
      AND repo           = '${esc(repo)}'
      AND ref            = 'main'
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
    SELECT id, service_name, title, status, impact,
           started_at, updated_at, url, affected_components
    FROM statusgator.incidents
    WHERE status != 'resolved'
    ORDER BY started_at DESC
    LIMIT 30
  `);
}

export function fetchRecentThirdPartyIncidents(windowHours = 24): Promise<CoralQueryResult> {
  const hrs = Math.min(Math.max(Math.floor(windowHours), 1), 168);
  return coral.query(`
    SELECT id, service_name, title, status, impact,
           started_at, resolved_at, url, affected_components
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(value: string): string {
  return value.replace(/'/g, "''");
}
