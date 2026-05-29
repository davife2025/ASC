/**
 * Maps PagerDuty service keys to GitHub owner/repo pairs.
 * Add your services here. Service keys are matched case-insensitively
 * with partial matching (e.g. "payments-api" matches "payments").
 */

export interface ServiceConfig {
  pagerdutyService: string; // PagerDuty service key / name
  github: { owner: string; repo: string };
}

// Loaded from env or defaults — teams should extend this list
const SERVICE_MAP_JSON = process.env.SERVICE_MAP_JSON;

const defaultServices: ServiceConfig[] = SERVICE_MAP_JSON
  ? (JSON.parse(SERVICE_MAP_JSON) as ServiceConfig[])
  : [
      // Example entries — override via SERVICE_MAP_JSON env var
      { pagerdutyService: 'api', github: { owner: 'your-org', repo: 'api' } },
      { pagerdutyService: 'web', github: { owner: 'your-org', repo: 'web' } },
      { pagerdutyService: 'payments', github: { owner: 'your-org', repo: 'payments-service' } },
      { pagerdutyService: 'auth', github: { owner: 'your-org', repo: 'auth-service' } },
      { pagerdutyService: 'data', github: { owner: 'your-org', repo: 'data-pipeline' } },
    ];

export function resolveGitHubRepo(
  serviceName: string
): { owner: string; repo: string } | null {
  const lower = serviceName.toLowerCase();
  const match = defaultServices.find((s) =>
    lower.includes(s.pagerdutyService.toLowerCase())
  );
  return match?.github ?? null;
}

export { defaultServices as services };
