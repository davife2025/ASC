import 'dotenv/config';

function req(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function opt(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

const coralEnabled = opt('CORAL_ENABLED', 'true').toLowerCase() !== 'false';

export const env = {
  port:         Number(opt('PORT', '3001')),
  nodeEnv:      opt('NODE_ENV', 'development'),
  webOrigin:    opt('WEB_ORIGIN', 'http://localhost:3000'),
  coralEnabled,

  supabase: {
    url:            req('SUPABASE_URL'),
    serviceRoleKey: req('SUPABASE_SERVICE_ROLE_KEY'),
  },

  hfToken: req('HF_TOKEN'),

  coral: {
    pagerdutyToken:   opt('PAGERDUTY_API_TOKEN'),
    grafanaUrl:       opt('GRAFANA_URL'),
    grafanaToken:     opt('GRAFANA_TOKEN'),
    githubToken:      opt('GITHUB_TOKEN'),
    statusgatorToken: opt('STATUSGATOR_API_TOKEN'),
  },

  // Custom coral binary path — used for WSL on Windows
  // e.g. CORAL_BIN=wsl -d Ubuntu -e coral
  coralBin:       opt('CORAL_BIN', 'coral'),
  coralConfigDir: opt('CORAL_CONFIG_DIR'),

  pagerdutyWebhookSecret: opt('PAGERDUTY_WEBHOOK_SECRET'),
  serviceMapJson:         opt('SERVICE_MAP_JSON'),
} as const;
