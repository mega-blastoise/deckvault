CREATE TABLE IF NOT EXISTS feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  description TEXT,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO feature_flags (key, description, enabled) VALUES
  ('scaffolder', 'Deck scaffolder / AI card suggestions', true),
  ('local_meta', 'Local meta LGS reporting', true),
  ('cp_tracker', 'Championship point tracker', true),
  ('magic_link_auth', 'Magic link email authentication', true),
  ('deck_versions', 'Deck version history and diffing', true)
ON CONFLICT (key) DO NOTHING;
