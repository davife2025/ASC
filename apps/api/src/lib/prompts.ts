export const SYSTEM_PROMPT = `You are an expert Site Reliability Engineer (SRE) and incident responder.

You will be given raw data collected from four monitoring sources about an active production incident:
- PagerDuty: incident details and log entries
- Datadog: firing monitors, recent error events, service health
- GitHub: recent merged pull requests and failed CI workflows
- StatusGator: active third-party service incidents

Your job is to correlate this data and produce a structured incident summary.

RULES:
- Be precise and concise. No filler text.
- Root cause should be your best hypothesis based on the evidence.
- Confidence is "high" if there is clear causal evidence, "medium" if circumstantial, "low" if speculative.
- If a recent deploy correlates with incident start time, flag it as a probable cause.
- If a third-party outage overlaps with incident time, flag it.
- Timeline events must be sorted chronologically (oldest first).
- Recommended actions should be actionable and specific.
- Respond ONLY with valid JSON matching the schema. No markdown, no explanation.

OUTPUT SCHEMA:
{
  "root_cause": "string — one concise sentence",
  "contributing_factors": ["string"],
  "timeline": [
    { "timestamp": "ISO8601", "source": "pagerduty|datadog|github|statusgator", "event": "string", "severity": "critical|high|medium|low|info" }
  ],
  "affected_services": ["string"],
  "recent_deploys": [
    { "repo": "string", "sha": "string", "message": "string", "author": "string", "deployed_at": "ISO8601", "url": "string" }
  ],
  "datadog_anomalies": ["string"],
  "third_party_issues": [
    { "service": "string", "status": "string", "description": "string", "started_at": "ISO8601" }
  ],
  "recommended_actions": ["string"],
  "confidence": "high|medium|low"
}`;

// Approx chars budget per section to stay under ~80k token prompt
const BUDGET = {
  logEntries:          8_000,
  firingMonitors:      6_000,
  datadogEvents:       10_000,
  serviceHealth:       5_000,
  datadogIncidents:    4_000,
  recentPRs:           5_000,
  failedWorkflows:     3_000,
  thirdPartyIncidents: 5_000,
  thirdPartyComponents:4_000,
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
  incident: Record<string, unknown>;
  logEntries: Record<string, unknown>[];
  firingMonitors: Record<string, unknown>[];
  datadogEvents: Record<string, unknown>[];
  serviceHealth: Record<string, unknown>[];
  datadogIncidents: Record<string, unknown>[];
  recentPRs: Record<string, unknown>[];
  failedWorkflows: Record<string, unknown>[];
  thirdPartyIncidents: Record<string, unknown>[];
  thirdPartyComponents: Record<string, unknown>[];
}): string {
  const logEntries          = truncate(data.logEntries,          BUDGET.logEntries);
  const firingMonitors      = truncate(data.firingMonitors,      BUDGET.firingMonitors);
  const datadogEvents       = truncate(data.datadogEvents,       BUDGET.datadogEvents);
  const serviceHealth       = truncate(data.serviceHealth,       BUDGET.serviceHealth);
  const datadogIncidents    = truncate(data.datadogIncidents,    BUDGET.datadogIncidents);
  const recentPRs           = truncate(data.recentPRs,           BUDGET.recentPRs);
  const failedWorkflows     = truncate(data.failedWorkflows,     BUDGET.failedWorkflows);
  const thirdPartyIncidents = truncate(data.thirdPartyIncidents, BUDGET.thirdPartyIncidents);
  const thirdPartyComponents= truncate(data.thirdPartyComponents,BUDGET.thirdPartyComponents);

  return `Analyse this production incident and return a JSON summary.

## PAGERDUTY INCIDENT
${JSON.stringify(data.incident, null, 2)}

## PAGERDUTY LOG ENTRIES (showing ${logEntries.length}/${data.logEntries.length})
${JSON.stringify(logEntries, null, 2)}

## DATADOG FIRING MONITORS (showing ${firingMonitors.length}/${data.firingMonitors.length})
${JSON.stringify(firingMonitors, null, 2)}

## DATADOG RECENT ERROR EVENTS (showing ${datadogEvents.length}/${data.datadogEvents.length})
${JSON.stringify(datadogEvents, null, 2)}

## DATADOG SERVICE HEALTH (showing ${serviceHealth.length}/${data.serviceHealth.length})
${JSON.stringify(serviceHealth, null, 2)}

## DATADOG ACTIVE INCIDENTS
${JSON.stringify(datadogIncidents, null, 2)}

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
