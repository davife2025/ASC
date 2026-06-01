#!/usr/bin/env tsx
/**
 * Registers all 4 Coral sources.
 *
 * Windows (WSL): set CORAL_BIN in .env
 *   CORAL_BIN=wsl -d Ubuntu -e env CORAL_CONFIG_DIR=/home/USER/.config/coral /home/USER/.local/bin/coral
 *
 * Usage:
 *   pnpm setup:coral
 */

import { execSync } from 'child_process';
import 'dotenv/config';

const sources = [
  { name: 'pagerduty',   env: { PAGERDUTY_API_TOKEN:   process.env.PAGERDUTY_API_TOKEN } },
  { name: 'grafana',     env: { GRAFANA_URL:            process.env.GRAFANA_URL, GRAFANA_TOKEN: process.env.GRAFANA_TOKEN } },
  { name: 'github',      env: { GITHUB_TOKEN:           process.env.GITHUB_TOKEN } },
  { name: 'statusgator', env: { STATUSGATOR_API_TOKEN:  process.env.STATUSGATOR_API_TOKEN } },
];

// Resolve coral binary — supports CORAL_BIN for WSL on Windows
const CORAL_BIN = process.env.CORAL_BIN?.trim() || 'coral';

function coralCmd(args: string): string {
  // CORAL_BIN may be "wsl -d Ubuntu -e coral" — append args at end
  return `${CORAL_BIN} ${args}`;
}

const baseEnv: NodeJS.ProcessEnv = {
  ...process.env,
  ...(process.env.CORAL_CONFIG_DIR ? { CORAL_CONFIG_DIR: process.env.CORAL_CONFIG_DIR } : {}),
};

for (const source of sources) {
  const missing = Object.entries(source.env)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    console.error(`[setup-coral] ✗ ${source.name}: missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  try {
    console.log(`[setup-coral] registering source: ${source.name}`);
    execSync(coralCmd(`source add ${source.name}`), {
      stdio: 'inherit',
      env:   { ...baseEnv, ...source.env } as NodeJS.ProcessEnv,
    });
    console.log(`[setup-coral] ✓ ${source.name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists')) {
      console.log(`[setup-coral] ✓ ${source.name} (updated)`);
    } else {
      console.error(`[setup-coral] ✗ ${source.name}: ${msg}`);
      process.exit(1);
    }
  }
}

console.log('\n[setup-coral] All 4 sources registered.');
