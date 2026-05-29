# SRE Investigator

AI-powered incident investigation agent powered by [Coral](https://withcoral.com).

Correlates **PagerDuty** incidents → **Datadog** metrics → **GitHub** deploys → **StatusGator** third-party status to auto-generate root cause summaries.

## Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **API**: Hono on Node.js (`apps/api`)
- **Web**: Next.js 15 + Tailwind (`apps/web`)
- **DB**: Supabase (Postgres)
- **AI**: Anthropic Claude via `@anthropic-ai/sdk`
- **Data**: Coral MCP (PagerDuty, Datadog, GitHub, StatusGator)

## Structure

```
sre-investigator/
├── apps/
│   ├── api/                  # Hono REST API + Coral agent
│   └── web/                  # Next.js dashboard
├── packages/
│   └── types/                # Shared TypeScript types
└── supabase/
    └── migrations/           # DB schema
```

## Setup

```bash
# Install
pnpm install

# Env
cp .env.example .env
cp apps/web/.env.local.example apps/web/.env.local
# Fill in all values

# DB
supabase db push   # or run migrations/001_init.sql in Supabase SQL editor

# Dev
pnpm dev
```

## Sessions

| Session | Description |
|---------|-------------|
| 1 | Monorepo scaffold, types, DB schema ✅ |
| 2 | Coral integration + API routes |
| 3 | Incident summary agent |
| 4 | Supabase persistence |
| 5 | Web dashboard |
| 6 | Polish + demo |
