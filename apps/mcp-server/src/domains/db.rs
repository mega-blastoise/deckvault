use crate::domains::card::*;
use crate::domains::error::DomainError;
use crate::domains::set::*;
use rusqlite::{params, Connection, OpenFlags, Row};
use std::path::Path;
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, DomainError> {
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, DomainError> {
        self.conn.lock().map_err(|e| DomainError::Lock(e.to_string()))
    }

    pub fn get_card_by_id(&self, id: &str) -> Result<Option<PokemonCard>, DomainError> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare("SELECT * FROM pokemon_cards WHERE id = ?1")?;
        let mut rows = stmt.query_map(params![id], |row| Ok(row_to_card(row)))?;

        match rows.next() {
            Some(Ok(card)) => Ok(Some(card)),
            Some(Err(e)) => Err(DomainError::Database(e)),
            None => Ok(None),
        }
    }

    #[allow(dead_code)]
    pub fn search_cards(&self, query: &str, limit: i64) -> Result<Vec<PokemonCard>, DomainError> {
        let conn = self.lock()?;
        let pattern = format!("%{query}%");
        let mut stmt = conn.prepare(
            "SELECT * FROM pokemon_cards
             WHERE name LIKE ?1 OR id LIKE ?1 OR supertype LIKE ?1
             LIMIT ?2",
        )?;

        let cards = stmt
            .query_map(params![pattern, limit], |row| Ok(row_to_card(row)))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(cards)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn search_cards_filtered(
        &self,
        name_query: Option<&str>,
        pokemon_type: Option<&str>,
        supertype: Option<&str>,
        rarity: Option<&str>,
        set_id: Option<&str>,
        hp_min: Option<i32>,
        hp_max: Option<i32>,
        limit: i64,
        standard_only: bool,
    ) -> Result<Vec<PokemonCard>, DomainError> {
        let conn = self.lock()?;

        let mut conditions = Vec::new();
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(q) = name_query {
            conditions.push("name LIKE ?");
            param_values.push(Box::new(format!("%{q}%")));
        }
        if let Some(t) = pokemon_type {
            conditions.push("types LIKE ?");
            param_values.push(Box::new(format!("%\"{t}\"%")));
        }
        if let Some(s) = supertype {
            conditions.push("supertype = ?");
            param_values.push(Box::new(s.to_string()));
        }
        if let Some(r) = rarity {
            conditions.push("rarity = ?");
            param_values.push(Box::new(r.to_string()));
        }
        if let Some(sid) = set_id {
            conditions.push("set_id = ?");
            param_values.push(Box::new(sid.to_string()));
        }
        if let Some(min) = hp_min {
            conditions.push("hp >= ?");
            param_values.push(Box::new(min));
        }
        if let Some(max) = hp_max {
            conditions.push("hp <= ?");
            param_values.push(Box::new(max));
        }

        // Build WHERE clause, optionally restricting to current Standard rotation.
        // Basic Energy has no regulation_mark (NULL / empty) and is always legal.
        let mut where_parts: Vec<String> =
            conditions.iter().map(|s| (*s).to_string()).collect();
        if standard_only {
            where_parts.push(
                "(regulation_mark IN ('H', 'I', 'J') OR regulation_mark IS NULL OR regulation_mark = '')".to_string(),
            );
        }

        let where_clause = if where_parts.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_parts.join(" AND "))
        };

        let sql = format!("SELECT * FROM pokemon_cards {where_clause} LIMIT ?");
        param_values.push(Box::new(limit));

        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();

        let mut stmt = conn.prepare(&sql)?;
        let cards = stmt
            .query_map(param_refs.as_slice(), |row| Ok(row_to_card(row)))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(cards)
    }

    pub fn get_cards_in_set(
        &self,
        set_id: &str,
        limit: i64,
    ) -> Result<Vec<PokemonCard>, DomainError> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT * FROM pokemon_cards WHERE set_id = ?1
             ORDER BY CAST(number AS INTEGER) LIMIT ?2",
        )?;

        let cards = stmt
            .query_map(params![set_id, limit], |row| Ok(row_to_card(row)))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(cards)
    }

    pub fn list_sets(&self) -> Result<Vec<CardSet>, DomainError> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare("SELECT * FROM pokemon_card_sets ORDER BY release_date DESC")?;

        let sets = stmt
            .query_map([], |row| Ok(row_to_set(row)))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(sets)
    }

    #[allow(dead_code)]
    pub fn get_set_by_id(&self, id: &str) -> Result<Option<CardSet>, DomainError> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare("SELECT * FROM pokemon_card_sets WHERE id = ?1")?;

        let mut rows = stmt.query_map(params![id], |row| Ok(row_to_set(row)))?;

        match rows.next() {
            Some(Ok(set)) => Ok(Some(set)),
            Some(Err(e)) => Err(DomainError::Database(e)),
            None => Ok(None),
        }
    }

    pub fn card_count(&self) -> Result<i64, DomainError> {
        let conn = self.lock()?;
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM pokemon_cards", [], |row| row.get(0))?;
        Ok(count)
    }

    pub fn set_count(&self) -> Result<i64, DomainError> {
        let conn = self.lock()?;
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM pokemon_card_sets", [], |row| row.get(0))?;
        Ok(count)
    }
}

/// Parse a TEXT column containing a JSON array into Vec<T>.
/// Returns empty Vec on NULL or parse failure.
fn parse_json_array<T: serde::de::DeserializeOwned>(row: &Row, column: &str) -> Vec<T> {
    row.get::<_, Option<String>>(column)
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Parse a TEXT column containing a JSON object into Option<T>.
/// Returns None on NULL or parse failure.
fn parse_json_object<T: serde::de::DeserializeOwned>(row: &Row, column: &str) -> Option<T> {
    row.get::<_, Option<String>>(column)
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str(&s).ok())
}

/// Parse the evolves_from column, which stores a JSON-encoded string:
/// '"Charmeleon"' (with quotes) → Some("Charmeleon")
fn parse_evolves_from(row: &Row) -> Option<String> {
    row.get::<_, Option<String>>("evolves_from")
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str::<String>(&s).ok())
}

fn row_to_card(row: &Row) -> PokemonCard {
    PokemonCard {
        id: row.get("id").unwrap_or_default(),
        name: row.get("name").unwrap_or_default(),
        supertype: row.get("supertype").unwrap_or_default(),
        subtypes: parse_json_array(row, "subtypes"),
        hp: row.get("hp").ok(),
        types: parse_json_array(row, "types"),
        evolves_from: parse_evolves_from(row),
        evolves_to: parse_json_array(row, "evolves_to"),
        rules: parse_json_array(row, "rules"),
        abilities: parse_json_array(row, "abilities"),
        attacks: parse_json_array(row, "attacks"),
        weaknesses: parse_json_array(row, "weaknesses"),
        retreat_cost: parse_json_array(row, "retreat_cost"),
        converted_retreat_cost: row.get("converted_retreat_cost").ok(),
        set_id: row.get("set_id").unwrap_or_default(),
        number: row.get("number").unwrap_or_default(),
        artist: row.get("artist").ok().flatten(),
        rarity: row.get("rarity").ok().flatten(),
        flavor_text: row.get("flavor_text").ok().flatten(),
        national_pokedex_numbers: parse_json_array(row, "national_pokedex_numbers"),
        legalities: parse_json_object(row, "legalities"),
        images: parse_json_object(row, "images"),
        tcgplayer_url: row.get("tcgplayer_url").ok().flatten(),
        cardmarket_url: row.get("cardmarket_url").ok().flatten(),
        regulation_mark: row.get("regulation_mark").ok().flatten(),
    }
}

fn row_to_set(row: &Row) -> CardSet {
    CardSet {
        id: row.get("id").unwrap_or_default(),
        name: row.get("name").unwrap_or_default(),
        series: row.get("series").unwrap_or_default(),
        printed_total: row.get("printed_total").ok(),
        total: row.get("total").ok(),
        legalities: parse_json_object(row, "legalities"),
        ptcgo_code: row.get("ptcgo_code").ok().flatten(),
        release_date: row.get("release_date").ok().flatten(),
        updated_at: row.get("updated_at").ok().flatten(),
        images: parse_json_object(row, "images"),
    }
}
