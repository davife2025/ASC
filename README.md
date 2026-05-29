# SRE Investigator

AI-powered incident investigation powered by [Coral](https://withcoral.com) + Kimi K2.

Correlates **PagerDuty** incidents → **Datadog** metrics → **GitHub** deploys → **StatusGator** third-party status to auto-generate root cause summaries in seconds.

---

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │              apps/web (Next.js)          │
                    │  Incident feed · Investigation panel     │
                    │  Realtime via Supabase · Kimi K2 output  │
                    └──────────────┬──────────────────────────┘
                                   │ REST
                    ┌──────────────▼──────────────────────────┐
                    │              apps/api (Hono)             │
                    │  /incidents  /investigations  /coral     │
                    │  Background worker · Rate limiter        │
                    └──────┬───────────────────┬──────────────┘
                           │                   │
              ┌────────────▼──────┐   ┌────────▼────────────┐
              │   Coral MCP       │   │   Supabase           │
              │   (mcp-stdio)     │   │   incidents          │
              │                   │   │   investigations     │
              │  pagerduty.*      │   └─────────────────────┘
              │  datadog.*        │
              │  github.*         │         ┌─────────────┐
              │  statusgator.*    │──────►  │  Kimi K2    │
              └───────────────────┘         │  via HF     │
                                            └─────────────┘
```

## Stack

| Layer    | Technology |
|----------|-----------|
| Monorepo | pnpm workspaces + Turborepo |
| API      | Hono on Node.js 20 |
| Web      | Next.js 15 + Tailwind CSS |
| Database | Supabase (Postgres + Realtime) |
| Data     | Coral MCP — PagerDuty, Datadog, GitHub, StatusGator |
| LLM      | Kimi K2 via HuggingFace Inference |

---

## Quick Start

### 1. Install

```bash
pnpm install
```

### 2. Environment

```bash
cp .env.example .env
cp apps/web/.env.local.example apps/web/.env.local
```

Fill in all values. Required:

| Variable | Where to get it |
|----------|----------------|
| `SUPABASE_URL` | Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings |
| `SUPABASE_ANON_KEY` | Supabase project settings |
| `HF_TOKEN` | huggingface.co/settings/tokens |
| `PAGERDUTY_API_TOKEN` | PagerDuty → API Access Keys |
| `DD_API_KEY` + `DD_APPLICATION_KEY` | Datadog → Organisation Settings |
| `GITHUB_TOKEN` | GitHub → Developer Settings → PAT |
| `STATUSGATOR_API_TOKEN` | StatusGator → Account Settings |

### 3. Database

Run in Supabase SQL editor (or `supabase db push`):

```
supabase/migrations/001_init.sql     — schema + RLS
supabase/migrations/002_realtime.sql — enable realtime
```

### 4. Register Coral sources

```bash
pnpm setup:coral
```

This runs `coral source add` for all four sources using your env vars.

### 5. Service → GitHub mapping (optional but recommended)

Set `SERVICE_MAP_JSON` in `.env` to map PagerDuty service names to GitHub repos:

```json
[
  {"pagerdutyService":"payments-api","github":{"owner":"acme","repo":"payments-api"}},
  {"pagerdutyService":"auth","github":{"owner":"acme","repo":"auth-service"}}
]
```

### 6. Run

```bash
pnpm dev
# API: http://localhost:3001
# Web: http://localhost:3000
```

### 7. Demo data (optional)

```bash
pnpm seed:demo
```

Seeds 4 realistic incidents with a completed investigation ready to view.

---

## How it works

1. **Sync** — `POST /api/incidents/sync` pulls active high-urgency PagerDuty incidents via Coral and upserts them into Supabase.

2. **Investigate** — Click *Investigate* on any incident. The API creates an investigation record and fires the agent.

3. **Agent** — Runs 8 Coral queries in parallel across all 4 sources:
   - PagerDuty: incident detail + log entries
   - Datadog: firing monitors + error events + service health + active incidents
   - GitHub: recent merged PRs + failed workflows (last 6h, resolved repo via service map)
   - StatusGator: active third-party incidents + component status

4. **Kimi K2** — All raw data sent to `moonshotai/Kimi-K2-Instruct` via HuggingFace Inference. Model returns structured JSON: root cause, timeline, deploys, anomalies, recommended actions, confidence level.

5. **Result** — Summary saved to Supabase. Web dashboard updates in real time via Supabase Realtime.

---

## API Reference

```
GET  /api/health
GET  /api/incidents?status=&severity=&page=&per_page=
POST /api/incidents/sync
GET  /api/incidents/:id
GET  /api/incidents/:id/live
GET  /api/investigations?incident_id=&status=
POST /api/investigations           { incident_id }
GET  /api/investigations/:id
POST /api/investigations/:id/retry
GET  /api/coral/health
GET  /api/coral/sources
```

---

## Sessions

| # | Description |
|---|-------------|
| 1 | Monorepo scaffold, shared types, DB schema |
| 2 | Coral MCP client, all 4 source queries, API routes |
| 3 | Investigation agent, Kimi K2 integration, background worker |
| 4 | Web dashboard, LLM swap to Kimi K2, realtime setup |
| 5 | Realtime hooks, error boundaries, rate limiting, demo seed |
