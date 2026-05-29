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
  return `Analyse this production incident and return a JSON summary.

## PAGERDUTY INCIDENT
${JSON.stringify(data.incident, null, 2)}

## PAGERDUTY LOG ENTRIES (${data.logEntries.length} entries)
${JSON.stringify(data.logEntries.slice(0, 15), null, 2)}

## DATADOG FIRING MONITORS (${data.firingMonitors.length})
${JSON.stringify(data.firingMonitors.slice(0, 10), null, 2)}

## DATADOG RECENT ERROR EVENTS (${data.datadogEvents.length})
${JSON.stringify(data.datadogEvents.slice(0, 20), null, 2)}

## DATADOG SERVICE HEALTH
${JSON.stringify(data.serviceHealth.slice(0, 10), null, 2)}

## DATADOG ACTIVE INCIDENTS
${JSON.stringify(data.datadogIncidents, null, 2)}

## GITHUB RECENT MERGED PRs (last 6h)
${JSON.stringify(data.recentPRs, null, 2)}

## GITHUB FAILED WORKFLOWS (last 6h)
${JSON.stringify(data.failedWorkflows, null, 2)}

## THIRD-PARTY INCIDENTS (StatusGator)
${JSON.stringify(data.thirdPartyIncidents, null, 2)}

## THIRD-PARTY COMPONENT STATUS
${JSON.stringify(data.thirdPartyComponents.slice(0, 20), null, 2)}

Return ONLY the JSON object described in the system prompt.`;
}
