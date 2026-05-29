-- Add updated_at to investigations table
ALTER TABLE investigations
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill existing rows
UPDATE investigations
SET updated_at = COALESCE(completed_at, started_at);

-- Trigger to keep updated_at current
CREATE TRIGGER investigations_updated_at
  BEFORE UPDATE ON investigations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Index for worker stuck-recovery query
CREATE INDEX IF NOT EXISTS idx_investigations_updated_at
  ON investigations (updated_at)
  WHERE status = 'running';
