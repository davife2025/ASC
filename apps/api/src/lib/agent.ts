import { chatCompletion } from './llm.js';
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

export async function runInvestigation(investigationId: string): Promise<void> {
  console.log(`[agent] starting investigation ${investigationId}`);
  await setStatus(investigationId, 'running');

  try {
    const { data: investigation, error: invErr } = await supabase
      .from('investigations')
      .select('*, incidents(*)')
      .eq('id', investigationId)
      .single();

    if (invErr) throw new Error(`Investigation not found: ${invErr.message}`);

    const incident = investigation.incidents as Record<string, unknown>;
    const pagerdutyId = String(incident.pagerduty_id);
    const serviceName = String(incident.service_name ?? '');
    const ghRepo = resolveGitHubRepo(serviceName);

    console.log(`[agent] fetching Coral sources for incident ${pagerdutyId}`);

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
      ...(ghRepo
        ? [
            fetchRecentMergedPRs(ghRepo.owner, ghRepo.repo, 6),
            fetchFailedWorkflows(ghRepo.owner, ghRepo.repo),
          ]
        : []),
    ]);

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

    console.log('[agent] coral data:', {
      logEntries: raw.logEntries.length,
      firingMonitors: raw.firingMonitors.length,
      datadogEvents: raw.datadogEvents.length,
      recentPRs: raw.recentPRs.length,
      thirdPartyIncidents: raw.thirdPartyIncidents.length,
    });

    console.log(`[agent] calling Kimi K2 for incident summary`);
    const summary = await generateSummary(raw);

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

    console.log(`[agent] done (confidence: ${summary.confidence})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agent] failed:`, message);
    await setStatus(investigationId, 'failed', message);
  }
}

async function generateSummary(raw: Parameters<typeof buildUserPrompt>[0]): Promise<IncidentSummary> {
  const text = await chatCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(raw) },
    ],
    maxTokens: 2048,
    temperature: 0.1,
  });

  const clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();

  try {
    return JSON.parse(clean) as IncidentSummary;
  } catch {
    throw new Error(`Kimi K2 returned invalid JSON: ${clean.slice(0, 300)}`);
  }
}

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
      ...(status !== 'running' ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq('id', id);
}

function extract(
  settled: PromiseSettledResult<{ rows: Record<string, unknown>[] }> | undefined
): Record<string, unknown>[] | null {
  if (!settled || settled.status === 'rejected') {
    if (settled?.status === 'rejected') console.warn('[agent] query failed:', settled.reason);
    return null;
  }
  return settled.value.rows;
}
