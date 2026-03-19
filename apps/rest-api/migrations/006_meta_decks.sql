-- Meta deck archetypes (tournament-winning curated lists)
CREATE TABLE meta_decks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(120) NOT NULL,
  archetype    VARCHAR(80)  NOT NULL,
  format       VARCHAR(20)  NOT NULL,
  source_url   TEXT,
  placement    VARCHAR(20),
  event_name   VARCHAR(200),
  event_date   DATE,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meta_decks_format    ON meta_decks(format);
CREATE INDEX idx_meta_decks_archetype ON meta_decks(archetype);

-- Cards belonging to each meta deck
CREATE TABLE meta_deck_cards (
  id           UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_deck_id UUID     NOT NULL REFERENCES meta_decks(id) ON DELETE CASCADE,
  card_id      VARCHAR(30) NOT NULL,
  quantity     SMALLINT NOT NULL CHECK (quantity >= 1)
);

CREATE INDEX idx_meta_deck_cards_deck ON meta_deck_cards(meta_deck_id);

-- Curated budget substitutes for individual cards
CREATE TABLE card_substitutes (
  card_id       VARCHAR(30) NOT NULL,
  substitute_id VARCHAR(30) NOT NULL,
  notes         TEXT,
  PRIMARY KEY (card_id, substitute_id)
);
