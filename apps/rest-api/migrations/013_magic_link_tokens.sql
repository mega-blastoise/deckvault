-- Allow email-only users (no Google account)
ALTER TABLE users ALTER COLUMN google_id DROP NOT NULL;

-- Magic link authentication tokens.
-- user_id is NULL until the link is clicked — no account is created at request time.
CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_token ON magic_link_tokens(token);
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_email ON magic_link_tokens(email);
