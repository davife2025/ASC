#!/usr/bin/env tsx
/**
 * Run once to register all Coral sources using env vars.
 * Usage: pnpm tsx src/scripts/setup-coral.ts
 *
 * Coral reads credentials from env vars during `coral source add`.
 * Credentials are stored locally by Coral and used at query time.
 */

import { execSync } from 'child_process';
import 'dotenv/config';

const sources = [
  {
    name: 'pagerduty',
    env: { PAGERDUTY_API_TOKEN: process.env.PAGERDUTY_API_TOKEN },
  },
  {
    name: 'datadog',
    env: {
      DD_API_KEY: process.env.DD_API_KEY,
      DD_APPLICATION_KEY: process.env.DD_APPLICATION_KEY,
      DD_SITE: process.env.DD_SITE ?? 'datadoghq.com',
    },
  },
  {
    name: 'github',
    env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN },
  },
  {
    name: 'statusgator',
    env: { STATUSGATOR_API_TOKEN: process.env.STATUSGATOR_API_TOKEN },
  },
];

for (const source of sources) {
  const missing = Object.entries(source.env)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    console.error(`[setup-coral] ✗ ${source.name}: missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  try {
    console.log(`[setup-coral] adding source: ${source.name}`);
    execSync(`coral source add ${source.name}`, {
      stdio: 'inherit',
      env: { ...process.env, ...source.env },
    });
    console.log(`[setup-coral] ✓ ${source.name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // "already exists" is fine
    if (msg.includes('already') || msg.includes('exists')) {
      console.log(`[setup-coral] ✓ ${source.name} (already configured)`);
    } else {
      console.error(`[setup-coral] ✗ ${source.name}: ${msg}`);
      process.exit(1);
    }
  }
}

console.log('\n[setup-coral] All sources ready.');
