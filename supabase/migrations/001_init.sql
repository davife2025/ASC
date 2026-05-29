-- AI SRE Investigator schema

create extension if not exists "uuid-ossp";

-- ─── Incidents ───────────────────────────────────────────────────────────────

create table incidents (
  id              uuid primary key default uuid_generate_v4(),
  pagerduty_id    text unique not null,
  title           text not null,
  severity        text not null check (severity in ('critical','high','medium','low')),
  status          text not null check (status in ('triggered','acknowledged','resolved')),
  service_name    text not null,
  assigned_to     text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  updated_at      timestamptz not null default now()
);

-- ─── Investigations ──────────────────────────────────────────────────────────

create table investigations (
  id              uuid primary key default uuid_generate_v4(),
  incident_id     uuid not null references incidents(id) on delete cascade,
  status          text not null check (status in ('pending','running','complete','failed'))
                  default 'pending',
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  summary         jsonb,
  raw_data        jsonb,
  error           text,
  created_at      timestamptz not null default now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

create index idx_incidents_status      on incidents(status);
create index idx_incidents_severity    on incidents(severity);
create index idx_incidents_created_at  on incidents(created_at desc);
create index idx_investigations_incident on investigations(incident_id);
create index idx_investigations_status   on investigations(status);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table incidents      enable row level security;
alter table investigations enable row level security;

-- Service role bypasses RLS — web uses anon read-only policies below

create policy "anon read incidents" on incidents
  for select using (true);

create policy "anon read investigations" on investigations
  for select using (true);

-- ─── updated_at trigger ──────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger incidents_updated_at
  before update on incidents
  for each row execute function set_updated_at();
