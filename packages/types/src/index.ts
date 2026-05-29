// ─── Incident ───────────────────────────────────────────────────────────────

export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentStatus = 'triggered' | 'acknowledged' | 'resolved';
export type InvestigationStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface Incident {
  id: string;
  pagerduty_id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  created_at: string;
  resolved_at?: string;
  service_name: string;
  assigned_to?: string;
}

// ─── Investigation ───────────────────────────────────────────────────────────

export interface Investigation {
  id: string;
  incident_id: string;
  status: InvestigationStatus;
  started_at: string;
  completed_at?: string;
  summary?: IncidentSummary;
  raw_data?: InvestigationRawData;
  error?: string;
}

export interface IncidentSummary {
  root_cause: string;
  contributing_factors: string[];
  timeline: TimelineEvent[];
  affected_services: string[];
  recent_deploys: RecentDeploy[];
  datadog_anomalies: string[];
  third_party_issues: ThirdPartyIssue[];
  recommended_actions: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface TimelineEvent {
  timestamp: string;
  source: 'pagerduty' | 'datadog' | 'github' | 'statusgator';
  event: string;
  severity?: string;
}

export interface RecentDeploy {
  repo: string;
  sha: string;
  message: string;
  author: string;
  deployed_at: string;
  url: string;
}

export interface ThirdPartyIssue {
  service: string;
  status: string;
  description: string;
  started_at: string;
}

export interface InvestigationRawData {
  pagerduty: Record<string, unknown>;
  datadog: Record<string, unknown>;
  github: Record<string, unknown>;
  statusgator: Record<string, unknown>;
}

// ─── API ─────────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

// ─── Coral ───────────────────────────────────────────────────────────────────

export interface CoralQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  execution_ms: number;
}
