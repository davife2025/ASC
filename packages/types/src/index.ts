export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentStatus   = 'triggered' | 'acknowledged' | 'resolved';
export type InvestigationStatus = 'pending' | 'running' | 'complete' | 'failed';
export type EventSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type SourceName    = 'pagerduty' | 'grafana' | 'github' | 'statusgator';

export interface Incident {
  id:           string;
  pagerduty_id: string;
  title:        string;
  severity:     IncidentSeverity;
  status:       IncidentStatus;
  created_at:   string;
  resolved_at?: string | null;
  service_name: string;
  assigned_to?: string | null;
  updated_at?:  string;
}

export interface Investigation {
  id:           string;
  incident_id:  string;
  status:       InvestigationStatus;
  started_at:   string;
  completed_at?: string | null;
  summary?:     IncidentSummary | null;
  raw_data?:    InvestigationRawData | null;
  error?:       string | null;
}

export interface IncidentSummary {
  root_cause:           string;
  contributing_factors: string[];
  timeline:             TimelineEvent[];
  affected_services:    string[];
  recent_deploys:       RecentDeploy[];
  grafana_anomalies:    string[];           // was datadog_anomalies
  third_party_issues:   ThirdPartyIssue[];
  recommended_actions:  string[];
  confidence:           'high' | 'medium' | 'low';
}

export interface TimelineEvent {
  timestamp: string;
  source:    SourceName;
  event:     string;
  severity:  EventSeverity;
}

export interface RecentDeploy {
  repo:        string;
  sha:         string;
  message:     string;
  author:      string;
  deployed_at: string;
  url:         string;
}

export interface ThirdPartyIssue {
  service:     string;
  status:      string;
  description: string;
  started_at:  string;
}

export interface InvestigationRawData {
  pagerduty:   Record<string, unknown>;
  grafana:     Record<string, unknown>;
  github:      Record<string, unknown>;
  statusgator: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data:   T;
  error?: string;
}

export interface PaginatedResponse<T> {
  data:     T[];
  total:    number;
  page:     number;
  per_page: number;
}

export interface CoralQueryResult {
  columns:      string[];
  rows:         Record<string, unknown>[];
  row_count:    number;
  execution_ms: number;
}
