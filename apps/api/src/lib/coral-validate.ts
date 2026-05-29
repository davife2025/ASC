import { coral } from './coral.js';

// Expected tables per source. If Coral renames them, this will catch it early.
const EXPECTED: Record<string, string[]> = {
  pagerduty:   ['incidents', 'log_entries', 'change_events'],
  datadog:     ['monitors', 'events', 'incidents', 'service_health'],
  github:      ['pulls', 'commits', 'workflow_runs'],
  statusgator: ['incidents', 'service_components'],
};

export async function validateCoralSchema(): Promise<void> {
  console.log('[coral-validate] checking schema…');

  let result: Awaited<ReturnType<typeof coral.query>>;

  try {
    result = await coral.query(
      `SELECT schema_name, table_name FROM coral.tables ORDER BY 1, 2`
    );
  } catch (err) {
    console.error('[coral-validate] could not query coral.tables:', err);
    console.warn('[coral-validate] skipping validation — queries may fail at runtime');
    return;
  }

  // Build a set of "schema.table" strings from actual Coral catalog
  const actual = new Set(
    result.rows.map((r) => `${r.schema_name}.${r.table_name}`)
  );

  const missing: string[] = [];

  for (const [schema, tables] of Object.entries(EXPECTED)) {
    for (const table of tables) {
      const key = `${schema}.${table}`;
      if (!actual.has(key)) missing.push(key);
    }
  }

  if (missing.length === 0) {
    console.log(`[coral-validate] ✓ all ${Object.values(EXPECTED).flat().length} expected tables present`);
  } else {
    console.warn(
      `[coral-validate] ⚠ missing tables (queries will return empty results):\n` +
        missing.map((t) => `  - ${t}`).join('\n')
    );
    console.warn(
      '[coral-validate] run GET /api/coral/health to see the actual available tables'
    );
  }
}
