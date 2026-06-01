import { coral } from './coral.js';
import { env } from '../config/env.js';

const EXPECTED: Record<string, string[]> = {
  pagerduty:   ['incidents', 'log_entries', 'change_events'],
  grafana:     ['alert_rules', 'annotations', 'datasources'],
  github:      ['pulls', 'commits', 'workflow_runs'],
  statusgator: ['incidents', 'service_components'],
};

export async function validateCoralSchema(): Promise<void> {
  if (env.coralEnabled === false) {
    console.log('[coral-validate] skipped (CORAL_ENABLED=false)');
    return;
  }

  console.log('[coral-validate] checking schema via list_catalog…');

  let items: Array<{ schema: string; table: string; kind: string }>;

  try {
    items = await coral.listCatalog();
  } catch (err) {
    try {
      const result = await coral.query(
        `SELECT schema_name AS schema, table_name AS table, 'table' AS kind
         FROM coral.tables ORDER BY 1, 2`,
      );
      items = result.rows as Array<{ schema: string; table: string; kind: string }>;
    } catch {
      console.warn('[coral-validate] could not reach Coral — skipping schema check');
      if (err instanceof Error) {
        // Print just the first line of the error to keep logs clean
        console.warn('[coral-validate]', err.message.split('\n')[0]);
      }
      return;
    }
  }

  if (items.length === 0) {
    console.warn('[coral-validate] no tables found — run `pnpm setup:coral` to register sources');
    return;
  }

  const actual  = new Set(items.map((r) => `${r.schema}.${r.table}`));
  const missing = Object.entries(EXPECTED)
    .flatMap(([schema, tables]) => tables.map((t) => `${schema}.${t}`))
    .filter((key) => !actual.has(key));

  const total = Object.values(EXPECTED).flat().length;

  if (missing.length === 0) {
    console.log(`[coral-validate] ✓ all ${total} expected tables present (${items.length} total)`);
  } else {
    console.warn(
      `[coral-validate] ⚠ ${missing.length}/${total} tables missing:\n` +
        missing.map((t) => `  - ${t}`).join('\n'),
    );
    console.warn('[coral-validate] run `pnpm setup:coral` if sources are not registered yet');
  }
}
