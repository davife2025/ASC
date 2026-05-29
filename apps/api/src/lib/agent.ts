import { anthropic } from './anthropic.js';
import { supabase } from './supabase.js';
import { resolveGitHubRepo } from '../config/services.js';
import {
  fetchIncidentDetail,
  fetchIncidentLogEntries,
  fetchFiringMonitors,
  fetchRecentDatadogEvents,
  fetchServiceHealth,
  fetchDatadogIncidents,
  fetchRecentMergedPRs,
  fetchFailedWorkflows,
  fetchThirdPartyIncidents,
  fetchServiceComponentStatus,
} from './coral-queries.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';
import type { IncidentSummary } from '@sre/types';

// ─── Main entry point ────────────────────────────────────────────────────────

export async function runInvestigation(investigationId: string): Promise<void> {
  console.log(`[agent] starting investigation ${investigationId}`);

  // Mark as running
  await setStatus(investigationId, 'running');

  try {
    // 1. Load investigation + incident from Supabase
    const { data: investigation, error: invErr } = await supabase
      .from('investigations')
      .select('*, incidents(*)')
      .eq('id', investigationId)
      .single();

    if (invErr) throw new Error(`Investigation not found: ${invErr.message}`);

    const incident = investigation.incidents as Record<string, unknown>;
    const pagerdutyId = String(incident.pagerduty_id);
    const serviceName = String(incident.service_name ?? '');

    // 2. Resolve GitHub repo for this service
    const ghRepo = resolveGitHubRepo(serviceName);

    // 3. Fetch from all 4 sources in parallel via Coral
    console.log(`[agent] fetching from Coral sources for incident ${pagerdutyId}`);

    const [
      incidentDetail,
      logEntries,
      firingMonitors,
      datadogEvents,
      serviceHealth,
      datadogIncidents,
      thirdPartyIncidents,
      thirdPartyComponents,
      ...githubResults
    ] = await Promise.allSettled([
      fetchIncidentDetail(pagerdutyId),
      fetchIncidentLogEntries(pagerdutyId),
      fetchFiringMonitors(),
      fetchRecentDatadogEvents(180),
      fetchServiceHealth(),
      fetchDatadogIncidents(),
      fetchThirdPartyIncidents(),
      fetchServiceComponentStatus(),
      // GitHub queries only if we have a repo mapping
      ...(ghRepo
        ? [
            fetchRecentMergedPRs(ghRepo.owner, ghRepo.repo, 6),
            fetchFailedWorkflows(ghRepo.owner, ghRepo.repo),
          ]
        : []),
    ]);

    // Extract rows (settled promises, default to empty on rejection)
    const raw = {
      incident: extract(incidentDetail)?.[0] ?? incident,
      logEntries: extract(logEntries) ?? [],
      firingMonitors: extract(firingMonitors) ?? [],
      datadogEvents: extract(datadogEvents) ?? [],
      serviceHealth: extract(serviceHealth) ?? [],
      datadogIncidents: extract(datadogIncidents) ?? [],
      thirdPartyIncidents: extract(thirdPartyIncidents) ?? [],
      thirdPartyComponents: extract(thirdPartyComponents) ?? [],
      recentPRs: ghRepo ? (extract(githubResults[0]) ?? []) : [],
      failedWorkflows: ghRepo ? (extract(githubResults[1]) ?? []) : [],
    };

    logRawSummary(raw);

    // 4. Call Claude with all collected data
    console.log(`[agent] calling Claude for incident summary`);
    const summary = await generateSummary(raw);

    // 5. Persist result
    await supabase
      .from('investigations')
      .update({
        status: 'complete',
        completed_at: new Date().toISOString(),
        summary,
        raw_data: {
          pagerduty: { incident: raw.incident, log_entries: raw.logEntries },
          datadog: {
            monitors: raw.firingMonitors,
            events: raw.datadogEvents,
            service_health: raw.serviceHealth,
            incidents: raw.datadogIncidents,
          },
          github: { prs: raw.recentPRs, workflows: raw.failedWorkflows },
          statusgator: {
            incidents: raw.thirdPartyIncidents,
            components: raw.thirdPartyComponents,
          },
        },
      })
      .eq('id', investigationId);

    console.log(`[agent] investigation ${investigationId} complete (confidence: ${summary.confidence})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agent] investigation ${investigationId} failed:`, message);
    await setStatus(investigationId, 'failed', message);
  }
}

// ─── Claude call ─────────────────────────────────────────────────────────────

async function generateSummary(raw: Parameters<typeof buildUserPrompt>[0]): Promise<IncidentSummary> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(raw) }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  // Strip any accidental markdown fences
  const clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();

  let parsed: IncidentSummary;
  try {
    parsed = JSON.parse(clean) as IncidentSummary;
  } catch {
    throw new Error(`Claude returned invalid JSON: ${clean.slice(0, 300)}`);
  }

  return parsed;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function setStatus(
  id: string,
  status: 'running' | 'complete' | 'failed',
  error?: string
): Promise<void> {
  await supabase
    .from('investigations')
    .update({
      status,
      ...(error ? { error } : {}),
      ...(status === 'complete' || status === 'failed'
        ? { completed_at: new Date().toISOString() }
        : {}),
    })
    .eq('id', id);
}

function extract(
  settled: PromiseSettledResult<{ rows: Record<string, unknown>[] }> | undefined
): Record<string, unknown>[] | null {
  if (!settled || settled.status === 'rejected') {
    if (settled?.status === 'rejected') {
      console.warn('[agent] coral query failed:', settled.reason);
    }
    return null;
  }
  return settled.value.rows;
}

function logRawSummary(raw: Record<string, unknown[]>): void {
  console.log('[agent] coral data collected:', {
    logEntries: raw.logEntries.length,
    firingMonitors: raw.firingMonitors.length,
    datadogEvents: raw.datadogEvents.length,
    recentPRs: raw.recentPRs.length,
    thirdPartyIncidents: raw.thirdPartyIncidents.length,
  });
}
