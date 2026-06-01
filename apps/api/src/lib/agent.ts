import { chatCompletion } from './llm.js';
import { supabase } from './supabase.js';
import { resolveGitHubRepo } from '../config/services.js';
import {
  fetchIncidentDetail,
  fetchIncidentLogEntries,
  fetchFiringAlertRules,
  fetchRecentAlertAnnotations,
  fetchAllAlertRules,
  fetchDatasources,
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

    const incident    = investigation.incidents as Record<string, unknown>;
    const pagerdutyId = String(incident.pagerduty_id);
    const serviceName = String(incident.service_name ?? '');
    const ghRepo      = resolveGitHubRepo(serviceName);

    console.log(`[agent] fetching Coral sources for ${pagerdutyId}`);

    const [
      incidentDetailResult,
      logEntriesResult,
      firingAlertRulesResult,
      alertAnnotationsResult,
      allAlertRulesResult,
      datasourcesResult,
      thirdPartyIncidentsResult,
      thirdPartyComponentsResult,
      recentPRsResult,
      failedWorkflowsResult,
    ] = await Promise.allSettled([
      fetchIncidentDetail(pagerdutyId),
      fetchIncidentLogEntries(pagerdutyId),
      fetchFiringAlertRules(),
      fetchRecentAlertAnnotations(180),
      fetchAllAlertRules(),
      fetchDatasources(),
      fetchThirdPartyIncidents(),
      fetchServiceComponentStatus(),
      ghRepo
        ? fetchRecentMergedPRs(ghRepo.owner, ghRepo.repo, 6)
        : Promise.resolve({ rows: [], columns: [], row_count: 0, execution_ms: 0 }),
      ghRepo
        ? fetchFailedWorkflows(ghRepo.owner, ghRepo.repo)
        : Promise.resolve({ rows: [], columns: [], row_count: 0, execution_ms: 0 }),
    ]);

    const raw = {
      incident:             extract(incidentDetailResult)?.[0] ?? incident,
      logEntries:           extract(logEntriesResult)           ?? [],
      firingAlertRules:     extract(firingAlertRulesResult)     ?? [],
      alertAnnotations:     extract(alertAnnotationsResult)     ?? [],
      allAlertRules:        extract(allAlertRulesResult)        ?? [],
      datasources:          extract(datasourcesResult)          ?? [],
      thirdPartyIncidents:  extract(thirdPartyIncidentsResult)  ?? [],
      thirdPartyComponents: extract(thirdPartyComponentsResult) ?? [],
      recentPRs:            extract(recentPRsResult)            ?? [],
      failedWorkflows:      extract(failedWorkflowsResult)      ?? [],
    };

    console.log('[agent] coral data:', {
      logEntries:       raw.logEntries.length,
      firingAlerts:     raw.firingAlertRules.length,
      annotations:      raw.alertAnnotations.length,
      recentPRs:        raw.recentPRs.length,
      thirdParty:       raw.thirdPartyIncidents.length,
    });

    const summary = await generateSummary(raw);

    await supabase
      .from('investigations')
      .update({
        status:       'complete',
        completed_at: new Date().toISOString(),
        summary,
        raw_data: {
          pagerduty:   { incident: raw.incident, log_entries: raw.logEntries },
          grafana:     {
            firing_alert_rules: raw.firingAlertRules,
            annotations:        raw.alertAnnotations,
            all_alert_rules:    raw.allAlertRules,
            datasources:        raw.datasources,
          },
          github:      { prs: raw.recentPRs, workflows: raw.failedWorkflows },
          statusgator: { incidents: raw.thirdPartyIncidents, components: raw.thirdPartyComponents },
        },
      })
      .eq('id', investigationId);

    console.log(`[agent] done — confidence: ${summary.confidence}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agent] failed:`, message);
    await setStatus(investigationId, 'failed', message);
  }
}

async function generateSummary(raw: Parameters<typeof buildUserPrompt>[0]): Promise<IncidentSummary> {
  const userPrompt = buildUserPrompt(raw);
  const estimatedTokens = (SYSTEM_PROMPT.length + userPrompt.length) / 4;
  if (estimatedTokens > 100_000) {
    console.warn(`[agent] prompt ~${Math.round(estimatedTokens)} tokens — may be truncated`);
  }

  const text = await chatCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userPrompt },
    ],
    maxTokens:   2048,
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
  error?: string,
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
  settled: PromiseSettledResult<{ rows: Record<string, unknown>[] }>,
): Record<string, unknown>[] | null {
  if (settled.status === 'rejected') {
    console.warn('[agent] coral query failed:', settled.reason);
    return null;
  }
  return settled.value.rows;
}
