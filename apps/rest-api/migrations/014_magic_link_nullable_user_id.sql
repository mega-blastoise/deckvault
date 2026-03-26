-- Fix: magic_link_tokens.user_id must be nullable.
-- Tokens are created before the user exists; upsert happens only on verify.
ALTER TABLE magic_link_tokens ALTER COLUMN user_id DROP NOT NULL;
