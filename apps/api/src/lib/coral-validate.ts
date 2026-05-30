import { coral } from './coral.js';

// Expected tables per source (confirmed against withcoral.com/docs/reference/bundled-sources)
const EXPECTED: Record<string, string[]> = {
  pagerduty:   ['incidents', 'log_entries', 'change_events'],
  datadog:     ['monitors', 'events', 'incidents'],
  github:      ['pulls', 'commits', 'workflow_runs'],
  statusgator: ['incidents', 'service_components'],
};

export async function validateCoralSchema(): Promise<void> {
  // Skip entirely if coral is not enabled (e.g. local dev without coral installed)
  if (!process.env.CORAL_ENABLED || process.env.CORAL_ENABLED === 'false') {
    console.log('[coral-validate] skipped — set CORAL_ENABLED=true to enable');
    return;
  }

  console.log('[coral-validate] checking schema via list_catalog…');

  let items: Array<{ schema: string; table: string; kind: string }>;

  try {
    items = await coral.listCatalog();
  } catch (err) {
    // Fallback: try via SQL (works once sources are added)
    try {
      const result = await coral.query(
        `SELECT schema_name AS schema, table_name AS table, 'table' AS kind
         FROM coral.tables ORDER BY 1, 2`,
      );
      items = result.rows as Array<{ schema: string; table: string; kind: string }>;
    } catch {
      console.warn('[coral-validate] could not reach Coral — skipping schema check');
      console.warn('[coral-validate] error:', err);
      return;
    }
  }

  if (items.length === 0) {
    console.warn('[coral-validate] no tables found — run `pnpm setup:coral` to register sources');
    return;
  }

  // Build set of "schema.table" from actual catalog
  const actual = new Set(items.map((r) => `${r.schema}.${r.table}`));
  const missing: string[] = [];

  for (const [schema, tables] of Object.entries(EXPECTED)) {
    for (const table of tables) {
      if (!actual.has(`${schema}.${table}`)) missing.push(`${schema}.${table}`);
    }
  }

  const total = Object.values(EXPECTED).flat().length;

  if (missing.length === 0) {
    console.log(`[coral-validate] ✓ all ${total} expected tables present (${items.length} total in catalog)`);
  } else {
    console.warn(
      `[coral-validate] ⚠ ${missing.length}/${total} expected tables missing:\n` +
        missing.map((t) => `  - ${t}`).join('\n'),
    );
    console.warn('[coral-validate] run `pnpm setup:coral` if sources are not yet registered');
  }
}