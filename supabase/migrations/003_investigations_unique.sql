-- Fix: unique constraint so investigations upsert works correctly
ALTER TABLE investigations
  ADD CONSTRAINT investigations_incident_id_key UNIQUE (incident_id);

-- Fix: only one active investigation per incident at a time is enforced at DB level
-- The API already guards this but DB constraint is the safety net
