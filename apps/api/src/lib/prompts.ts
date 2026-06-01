export const SYSTEM_PROMPT = `You are an expert Site Reliability Engineer (SRE) and incident responder.

You will be given raw data collected from four monitoring sources about an active production incident:
- PagerDuty: incident details and log entries
- Grafana: firing alert rules, recent alert annotations, and datasource health
- GitHub: recent merged pull requests and failed CI workflows
- StatusGator: active third-party service incidents

Your job is to correlate this data and produce a structured incident summary.

RULES:
- Be precise and concise. No filler text.
- Root cause should be your best hypothesis based on the evidence.
- Confidence is "high" if there is clear causal evidence, "medium" if circumstantial, "low" if speculative.
- If a recent deploy correlates with incident start time, flag it as a probable cause.
- If a third-party outage overlaps with incident time, flag it.
- If a Grafana alert rule is firing, treat it as an anomaly signal.
- Timeline events must be sorted chronologically (oldest first).
- Recommended actions should be actionable and specific.
- Respond ONLY with valid JSON matching the schema. No markdown, no explanation.

OUTPUT SCHEMA:
{
  "root_cause": "string — one concise sentence",
  "contributing_factors": ["string"],
  "timeline": [
    { "timestamp": "ISO8601", "source": "pagerduty|grafana|github|statusgator", "event": "string", "severity": "critical|high|medium|low|info" }
  ],
  "affected_services": ["string"],
  "recent_deploys": [
    { "repo": "string", "sha": "string", "message": "string", "author": "string", "deployed_at": "ISO8601", "url": "string" }
  ],
  "grafana_anomalies": ["string"],
  "third_party_issues": [
    { "service": "string", "status": "string", "description": "string", "started_at": "ISO8601" }
  ],
  "recommended_actions": ["string"],
  "confidence": "high|medium|low"
}`;

const BUDGET = {
  logEntries:           8_000,
  firingAlertRules:     6_000,
  alertAnnotations:     8_000,
  allAlertRules:        4_000,
  recentPRs:            5_000,
  failedWorkflows:      3_000,
  thirdPartyIncidents:  5_000,
  thirdPartyComponents: 4_000,
};

function truncate(rows: Record<string, unknown>[], maxChars: number): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  let total = 0;
  for (const row of rows) {
    const s = JSON.stringify(row);
    if (total + s.length > maxChars) break;
    result.push(row);
    total += s.length;
  }
  return result;
}

export function buildUserPrompt(data: {
  incident:             Record<string, unknown>;
  logEntries:           Record<string, unknown>[];
  firingAlertRules:     Record<string, unknown>[];
  alertAnnotations:     Record<string, unknown>[];
  allAlertRules:        Record<string, unknown>[];
  datasources:          Record<string, unknown>[];
  recentPRs:            Record<string, unknown>[];
  failedWorkflows:      Record<string, unknown>[];
  thirdPartyIncidents:  Record<string, unknown>[];
  thirdPartyComponents: Record<string, unknown>[];
}): string {
  const logEntries           = truncate(data.logEntries,           BUDGET.logEntries);
  const firingAlertRules     = truncate(data.firingAlertRules,     BUDGET.firingAlertRules);
  const alertAnnotations     = truncate(data.alertAnnotations,     BUDGET.alertAnnotations);
  const allAlertRules        = truncate(data.allAlertRules,        BUDGET.allAlertRules);
  const recentPRs            = truncate(data.recentPRs,            BUDGET.recentPRs);
  const failedWorkflows      = truncate(data.failedWorkflows,      BUDGET.failedWorkflows);
  const thirdPartyIncidents  = truncate(data.thirdPartyIncidents,  BUDGET.thirdPartyIncidents);
  const thirdPartyComponents = truncate(data.thirdPartyComponents, BUDGET.thirdPartyComponents);

  return `Analyse this production incident and return a JSON summary.

## PAGERDUTY INCIDENT
${JSON.stringify(data.incident, null, 2)}

## PAGERDUTY LOG ENTRIES (showing ${logEntries.length}/${data.logEntries.length})
${JSON.stringify(logEntries, null, 2)}

## GRAFANA FIRING ALERT RULES (showing ${firingAlertRules.length}/${data.firingAlertRules.length})
${JSON.stringify(firingAlertRules, null, 2)}

## GRAFANA ALERT ANNOTATIONS — last 3h (showing ${alertAnnotations.length}/${data.alertAnnotations.length})
${JSON.stringify(alertAnnotations, null, 2)}

## GRAFANA ALL ALERT RULES — health overview (showing ${allAlertRules.length}/${data.allAlertRules.length})
${JSON.stringify(allAlertRules, null, 2)}

## GRAFANA DATASOURCES
${JSON.stringify(data.datasources, null, 2)}

## GITHUB RECENT MERGED PRs — last 6h (showing ${recentPRs.length}/${data.recentPRs.length})
${JSON.stringify(recentPRs, null, 2)}

## GITHUB FAILED WORKFLOWS — last 6h (showing ${failedWorkflows.length}/${data.failedWorkflows.length})
${JSON.stringify(failedWorkflows, null, 2)}

## THIRD-PARTY INCIDENTS — StatusGator (showing ${thirdPartyIncidents.length}/${data.thirdPartyIncidents.length})
${JSON.stringify(thirdPartyIncidents, null, 2)}

## THIRD-PARTY COMPONENT STATUS (showing ${thirdPartyComponents.length}/${data.thirdPartyComponents.length})
${JSON.stringify(thirdPartyComponents, null, 2)}

Return ONLY the JSON object described in the system prompt.`;
}
