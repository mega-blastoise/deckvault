CREATE TABLE IF NOT EXISTS user_collections (
  user_id   UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id   TEXT    NOT NULL,
  quantity  SMALLINT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  PRIMARY KEY (user_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_user_collections_user_id ON user_collections(user_id);
