import 'dotenv/config';

function require(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  port: Number(optional('PORT', '3001')),
  nodeEnv: optional('NODE_ENV', 'development'),

  supabase: {
    url: require('SUPABASE_URL'),
    serviceRoleKey: require('SUPABASE_SERVICE_ROLE_KEY'),
  },

  // Kimi K2 via HuggingFace Inference
  hfToken: require('HF_TOKEN'),

  coral: {
    pagerdutyToken: require('PAGERDUTY_API_TOKEN'),
    ddApiKey: require('DD_API_KEY'),
    ddAppKey: require('DD_APPLICATION_KEY'),
    ddSite: optional('DD_SITE', 'datadoghq.com'),
    githubToken: require('GITHUB_TOKEN'),
    statusgatorToken: require('STATUSGATOR_API_TOKEN'),
  },

  serviceMapJson: optional('SERVICE_MAP_JSON', ''),
} as const;
