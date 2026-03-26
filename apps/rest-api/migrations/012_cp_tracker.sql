CREATE TABLE IF NOT EXISTS cp_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_name  VARCHAR(200) NOT NULL,
  event_date  DATE NOT NULL,
  placement   VARCHAR(20),
  cp_earned   SMALLINT NOT NULL CHECK (cp_earned >= 0 AND cp_earned <= 500),
  format      VARCHAR(20) NOT NULL DEFAULT 'standard',
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cp_entries_user ON cp_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_cp_entries_date ON cp_entries(event_date);
