#!/usr/bin/env tsx
/**
 * Registers all 4 Coral sources using env vars (no --interactive prompt).
 * Safe to re-run — existing sources are updated in place.
 *
 * Usage:
 *   pnpm setup:coral                          # local
 *   docker compose run api pnpm setup:coral   # Docker (uses mounted coral volume)
 *
 * Docs: https://withcoral.com/docs/getting-started/quickstart
 *   "For scripted setups, omit --interactive and Coral reads each input from
 *    an environment variable of the same name"
 */

import { execSync } from 'child_process';
import 'dotenv/config';

const sources = [
  {
    name: 'pagerduty',
    env:  { PAGERDUTY_API_TOKEN: process.env.PAGERDUTY_API_TOKEN },
  },
  {
    name: 'datadog',
    env:  {
      DD_API_KEY:         process.env.DD_API_KEY,
      DD_APPLICATION_KEY: process.env.DD_APPLICATION_KEY,
      DD_SITE:            process.env.DD_SITE ?? 'datadoghq.com',
    },
  },
  {
    name: 'github',
    env:  { GITHUB_TOKEN: process.env.GITHUB_TOKEN },
  },
  {
    name: 'statusgator',
    env:  { STATUSGATOR_API_TOKEN: process.env.STATUSGATOR_API_TOKEN },
  },
];

// Pass CORAL_CONFIG_DIR through if set — required for Docker persistence
const coralEnv: NodeJS.ProcessEnv = {
  ...process.env,
  ...(process.env.CORAL_CONFIG_DIR
    ? { CORAL_CONFIG_DIR: process.env.CORAL_CONFIG_DIR }
    : {}),
};

for (const source of sources) {
  const missing = Object.entries(source.env)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    console.error(`[setup-coral] ✗ ${source.name}: missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  const sourceEnv = { ...coralEnv, ...source.env };

  try {
    console.log(`[setup-coral] registering source: ${source.name}`);
    // coral source add <name>  (no --interactive = reads from env vars)
    execSync(`coral source add ${source.name}`, {
      stdio: 'inherit',
      env:   sourceEnv as NodeJS.ProcessEnv,
    });
    console.log(`[setup-coral] ✓ ${source.name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // "already exists" / re-run is fine — coral updates credentials in place
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists')) {
      console.log(`[setup-coral] ✓ ${source.name} (updated)`);
    } else {
      console.error(`[setup-coral] ✗ ${source.name}: ${msg}`);
      process.exit(1);
    }
  }
}

console.log('\n[setup-coral] All 4 sources registered. Run `coral source list` to verify.');
