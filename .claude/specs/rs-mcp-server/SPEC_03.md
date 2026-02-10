# SPEC-03: Pokemon Domain Logic

## Context

With the protocol layer (SPEC-01) and tool registry (SPEC-02) in place, we now connect to
real Pokemon TCG data and implement domain tools. The data lives in a SQLite database
(`apps/mcp-server/database/pokemon-data.sqlite3.db`) — a read-only replica of the canonical
`database/pokemon-data.sqlite3.db` used by the rest of the platform.

This phase is the largest. It introduces `rusqlite` for database access, JSON-in-TEXT
column deserialization (the SQLite schema stores arrays and objects as JSON strings in
TEXT columns), `reqwest` for live pricing HTTP calls, and a proper `thiserror` hierarchy.

### What You'll Learn

- `rusqlite` for synchronous SQLite access (Connection, query_map, params)
- Deserializing JSON strings stored inside TEXT columns with `serde_json::from_str`
- `thiserror` derive macros for structured error hierarchies
- `From<T>` trait to convert between error types
- `reqwest` async HTTP client for external API calls
- Iterator chains: `.filter().map().take().collect()`
- `Arc<T>` for sharing the database connection across tools
- Pattern matching on `Option<String>` → parse → `Option<Vec<T>>`

### Database Schema

The SQLite database has two tables. TEXT columns store JSON-encoded arrays/objects.

```
┌─────────────────────────────────────────────────────────────────┐
│ pokemon_card_sets                                                │
├─────────────────────────────────────────────────────────────────┤
│ id TEXT PRIMARY KEY        │ "base1"                             │
│ name TEXT NOT NULL         │ "Base"                              │
│ series TEXT NOT NULL       │ "Base"                              │
│ printed_total INTEGER      │ 102                                 │
│ total INTEGER              │ 102                                 │
│ legalities TEXT            │ '{"unlimited":"Legal"}'             │
│ ptcgo_code TEXT            │ "BS"                                │
│ release_date TEXT          │ "1999/01/09"                        │
│ updated_at TEXT            │ "2022/10/10 15:12:00"               │
│ images TEXT                │ '{"symbol":"...","logo":"..."}'     │
│ created_at TEXT            │ auto                                │
└─────────────────────────────────────────────────────────────────┘
         │
         │ set_id REFERENCES pokemon_card_sets(id)
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ pokemon_cards                                                    │
├─────────────────────────────────────────────────────────────────┤
│ id TEXT PRIMARY KEY        │ "base1-4"                           │
│ name TEXT NOT NULL         │ "Charizard"                         │
│ supertype TEXT NOT NULL    │ "Pokémon"                           │
│ subtypes TEXT NOT NULL     │ '["Stage 2"]'          (JSON array) │
│ hp INTEGER                 │ 120                                 │
│ types TEXT NOT NULL        │ '["Fire"]'             (JSON array) │
│ evolves_from TEXT          │ '"Charmeleon"'         (JSON string)│
│ evolves_to TEXT            │ '[]'                   (JSON array) │
│ rules TEXT                 │ '[]'                   (JSON array) │
│ abilities TEXT             │ '[{...}]'              (JSON array) │
│ attacks TEXT               │ '[{...}]'              (JSON array) │
│ weaknesses TEXT            │ '[{...}]'              (JSON array) │
│ retreat_cost TEXT          │ '["Colorless",...]'    (JSON array) │
│ converted_retreat_cost INT │ 3                                   │
│ set_id TEXT NOT NULL       │ "base1"            (FK → sets)      │
│ number TEXT NOT NULL       │ "4"                                 │
│ artist TEXT                │ "Mitsuhiro Arita"                   │
│ rarity TEXT                │ "Rare Holo"                         │
│ flavor_text TEXT           │ "Spits fire..."                     │
│ national_pokedex_numbers   │ '[6]'                  (JSON array) │
│ legalities TEXT            │ '{"unlimited":"Legal"}'(JSON object)│
│ images TEXT                │ '{"small":"...","large":"..."}'     │
│ tcgplayer_url TEXT         │ "https://prices.pokemontcg.io/..."  │
│ cardmarket_url TEXT        │ "https://prices.pokemontcg.io/..."  │
│ created_at TEXT            │ auto                                │
│ updated_at TEXT            │ auto                                │
└─────────────────────────────────────────────────────────────────┘

Index: idx_pokemon_cards_set_id ON pokemon_cards(set_id)

Notable quirks:
  - subtypes, types: JSON arrays stored as TEXT ─ '["Stage 2"]'
  - evolves_from: JSON string (with quotes) ─ '"Charmeleon"' not Charmeleon
  - abilities, attacks, weaknesses: JSON arrays of objects
  - hp: INTEGER in DB (unlike the JSON source files where it's a string)
  - No pricing columns ─ only tcgplayer_url and cardmarket_url redirect links
```

## Prerequisites

- SPEC-01 complete (JSON-RPC types, stdio transport)
- SPEC-02 complete (Tool trait, ToolRegistry, ToolError)
- SQLite database file at `apps/mcp-server/database/pokemon-data.sqlite3.db`

## Requirements

### 1. Dependencies

Add to `Cargo.toml`:

```toml
[dependencies]
# ... existing from SPEC-01/02 ...
rusqlite = { version = "0.32", features = ["bundled"] }
reqwest = { version = "0.12", features = ["json"] }
```

Why `bundled`? It compiles SQLite from source, avoiding system library version mismatches.
The MCP server binary becomes fully self-contained.

Why `reqwest` with `json`? For live pricing fetches from `api.pokemontcg.io`. The `json`
feature enables `.json::<T>()` deserialization on responses.

### 2. Domain Types (`domain/card.rs`)

These structs represent the **deserialized** card data after parsing JSON-in-TEXT columns.
They are NOT the raw row types — a separate step converts TEXT columns to typed fields.

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PokemonCard {
    pub id: String,
    pub name: String,
    pub supertype: String,
    pub subtypes: Vec<String>,
    pub hp: Option<i32>,
    pub types: Vec<String>,
    pub evolves_from: Option<String>,
    pub evolves_to: Vec<String>,
    pub rules: Vec<String>,
    pub abilities: Vec<Ability>,
    pub attacks: Vec<Attack>,
    pub weaknesses: Vec<Weakness>,
    pub retreat_cost: Vec<String>,
    pub converted_retreat_cost: Option<i32>,
    pub set_id: String,
    pub number: String,
    pub artist: Option<String>,
    pub rarity: Option<String>,
    pub flavor_text: Option<String>,
    pub national_pokedex_numbers: Vec<i32>,
    pub legalities: Option<Legalities>,
    pub images: Option<CardImages>,
    pub tcgplayer_url: Option<String>,
    pub cardmarket_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attack {
    pub name: String,
    #[serde(default)]
    pub cost: Vec<String>,
    #[serde(default)]
    pub converted_energy_cost: i32,
    #[serde(default)]
    pub damage: String,
    #[serde(default)]
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ability {
    pub name: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(rename = "type")]
    pub ability_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Weakness {
    #[serde(rename = "type")]
    pub weakness_type: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Legalities {
    #[serde(default)]
    pub unlimited: Option<String>,
    #[serde(default)]
    pub expanded: Option<String>,
    #[serde(default)]
    pub standard: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardImages {
    #[serde(default)]
    pub small: Option<String>,
    #[serde(default)]
    pub large: Option<String>,
}
```

### 3. Set Types (`domain/set.rs`)

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardSet {
    pub id: String,
    pub name: String,
    pub series: String,
    pub printed_total: Option<i32>,
    pub total: Option<i32>,
    pub legalities: Option<Legalities>,
    pub ptcgo_code: Option<String>,
    pub release_date: Option<String>,
    pub updated_at: Option<String>,
    pub images: Option<SetImages>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetImages {
    #[serde(default)]
    pub symbol: Option<String>,
    #[serde(default)]
    pub logo: Option<String>,
}
```

### 4. Error Hierarchy (`domain/error.rs`)

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DomainError {
    #[error("Card not found: {0}")]
    CardNotFound(String),

    #[error("Set not found: {0}")]
    SetNotFound(String),

    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("JSON parse error in column '{column}': {source}")]
    ColumnParse {
        column: String,
        source: serde_json::Error,
    },

    #[error("Invalid query: {0}")]
    InvalidQuery(String),

    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Pricing unavailable for card: {0}")]
    PricingUnavailable(String),
}
```

Wire into `ToolError`:

```rust
// In registry/tool.rs
impl From<DomainError> for ToolError {
    fn from(e: DomainError) -> Self {
        ToolError::ExecutionFailed(e.to_string())
    }
}
```

### 5. Database Layer (`domain/db.rs`)

Synchronous `rusqlite` access wrapped for the async tool context. The DB is opened
read-only — the MCP server never writes.

```rust
use rusqlite::{Connection, OpenFlags, params};
use std::path::Path;
use crate::domain::card::*;
use crate::domain::set::*;
use crate::domain::error::DomainError;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, DomainError> {
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        Ok(Self { conn })
    }

    pub fn get_card_by_id(&self, id: &str) -> Result<Option<PokemonCard>, DomainError> {
        let mut stmt = self.conn.prepare(
            "SELECT * FROM pokemon_cards WHERE id = ?1"
        )?;

        let mut rows = stmt.query_map(params![id], |row| {
            Ok(row_to_card(row))
        })?;

        match rows.next() {
            Some(Ok(card)) => Ok(Some(card)),
            Some(Err(e)) => Err(DomainError::Database(e)),
            None => Ok(None),
        }
    }

    pub fn search_cards(
        &self,
        query: &str,
        limit: i64,
    ) -> Result<Vec<PokemonCard>, DomainError> {
        let pattern = format!("%{query}%");
        let mut stmt = self.conn.prepare(
            "SELECT * FROM pokemon_cards
             WHERE name LIKE ?1 OR id LIKE ?1 OR supertype LIKE ?1
             LIMIT ?2"
        )?;

        let cards = stmt.query_map(params![pattern, limit], |row| {
            Ok(row_to_card(row))
        })?
        .filter_map(|r| r.ok())
        .collect();

        Ok(cards)
    }

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
    ) -> Result<Vec<PokemonCard>, DomainError> {
        // Build dynamic WHERE clause
        let mut conditions = Vec::new();
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(q) = name_query {
            conditions.push("name LIKE ?");
            param_values.push(Box::new(format!("%{q}%")));
        }
        if let Some(t) = pokemon_type {
            // types is a JSON array stored as TEXT, e.g. '["Fire"]'
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

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let sql = format!(
            "SELECT * FROM pokemon_cards {where_clause} LIMIT ?",
        );

        param_values.push(Box::new(limit));

        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();

        let mut stmt = self.conn.prepare(&sql)?;
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
        let mut stmt = self.conn.prepare(
            "SELECT * FROM pokemon_cards WHERE set_id = ?1
             ORDER BY CAST(number AS INTEGER) LIMIT ?2"
        )?;

        let cards = stmt.query_map(params![set_id, limit], |row| {
            Ok(row_to_card(row))
        })?
        .filter_map(|r| r.ok())
        .collect();

        Ok(cards)
    }

    pub fn list_sets(&self) -> Result<Vec<CardSet>, DomainError> {
        let mut stmt = self.conn.prepare(
            "SELECT * FROM pokemon_card_sets ORDER BY release_date DESC"
        )?;

        let sets = stmt.query_map([], |row| {
            Ok(row_to_set(row))
        })?
        .filter_map(|r| r.ok())
        .collect();

        Ok(sets)
    }

    pub fn get_set_by_id(&self, id: &str) -> Result<Option<CardSet>, DomainError> {
        let mut stmt = self.conn.prepare(
            "SELECT * FROM pokemon_card_sets WHERE id = ?1"
        )?;

        let mut rows = stmt.query_map(params![id], |row| {
            Ok(row_to_set(row))
        })?;

        match rows.next() {
            Some(Ok(set)) => Ok(Some(set)),
            Some(Err(e)) => Err(DomainError::Database(e)),
            None => Ok(None),
        }
    }

    pub fn card_count(&self) -> Result<i64, DomainError> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM pokemon_cards", [], |row| row.get(0),
        )?;
        Ok(count)
    }

    pub fn set_count(&self) -> Result<i64, DomainError> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM pokemon_card_sets", [], |row| row.get(0),
        )?;
        Ok(count)
    }
}
```

### 6. Row Conversion Functions (`domain/db.rs`, continued)

The critical learning moment: TEXT columns contain JSON strings that must be parsed
into typed Rust structs. This is where `serde_json::from_str` meets `Option` handling.

```rust
use rusqlite::Row;

/// Parse a TEXT column containing a JSON array into Vec<T>.
/// Returns empty Vec on NULL or parse failure.
fn parse_json_array<T: serde::de::DeserializeOwned>(
    row: &Row,
    column: &str,
) -> Vec<T> {
    row.get::<_, Option<String>>(column)
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Parse a TEXT column containing a JSON object into Option<T>.
/// Returns None on NULL or parse failure.
fn parse_json_object<T: serde::de::DeserializeOwned>(
    row: &Row,
    column: &str,
) -> Option<T> {
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
```

### 7. Live Pricing Types and Client (`domain/pricing.rs`)

Fetch live pricing from the Pokemon TCG API. The DB only stores redirect URLs, so
we use the card ID to call `api.pokemontcg.io/v2/cards/{id}` and extract pricing.

```rust
use serde::{Deserialize, Serialize};
use reqwest::Client;
use crate::domain::error::DomainError;

const POKEMON_TCG_API_BASE: &str = "https://api.pokemontcg.io/v2/cards";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PricePoint {
    #[serde(default)]
    pub low: Option<f64>,
    #[serde(default)]
    pub mid: Option<f64>,
    #[serde(default)]
    pub high: Option<f64>,
    #[serde(default)]
    pub market: Option<f64>,
    #[serde(default)]
    pub direct_low: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TcgPlayerPricing {
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub prices: Option<serde_json::Value>,  // Dynamic keys: holofoil, reverseHolofoil, normal, etc.
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardMarketPricing {
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub prices: Option<serde_json::Value>,  // Dynamic keys: averageSellPrice, trendPrice, etc.
}

#[derive(Debug, Clone, Deserialize)]
pub struct ApiCardResponse {
    pub data: ApiCardData,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiCardData {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub tcgplayer: Option<TcgPlayerPricing>,
    #[serde(default)]
    pub cardmarket: Option<CardMarketPricing>,
}

pub struct PricingClient {
    client: Client,
}

impl PricingClient {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .expect("Failed to create HTTP client");
        Self { client }
    }

    pub async fn fetch_pricing(&self, card_id: &str) -> Result<ApiCardData, DomainError> {
        let url = format!("{POKEMON_TCG_API_BASE}/{card_id}");

        let response: ApiCardResponse = self.client
            .get(&url)
            .header("User-Agent", "pokemon-mcp-server/0.1.0")
            .send()
            .await?
            .error_for_status()
            .map_err(|e| DomainError::PricingUnavailable(
                format!("{card_id}: {e}")
            ))?
            .json()
            .await?;

        Ok(response.data)
    }
}
```

### 8. Tool Implementations

All tools take `Arc<Database>` (shared read-only DB) and the pricing tool also takes
`Arc<PricingClient>`.

**Search Cards** (`tools/search_cards.rs`):

```rust
use std::sync::Arc;
use async_trait::async_trait;
use serde_json::{json, Value};
use crate::domain::db::Database;
use crate::domain::card::PokemonCard;
use crate::protocol::mcp::{CallToolResult, Content};
use crate::registry::tool::{Tool, ToolError};

pub struct SearchCardsTool {
    db: Arc<Database>,
}

impl SearchCardsTool {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl Tool for SearchCardsTool {
    fn name(&self) -> &str { "search_cards" }

    fn description(&self) -> &str {
        "Search Pokemon TCG cards by name, type, supertype, rarity, HP range, or set. \
         Returns matching cards with stats and attacks."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Text search on card name, ID, or supertype"
                },
                "type": {
                    "type": "string",
                    "description": "Filter by Pokemon type (e.g., 'Fire', 'Water', 'Grass')"
                },
                "supertype": {
                    "type": "string",
                    "description": "Filter by supertype ('Pokémon', 'Trainer', 'Energy')"
                },
                "rarity": {
                    "type": "string",
                    "description": "Filter by rarity (e.g., 'Rare Holo', 'Common')"
                },
                "set_id": {
                    "type": "string",
                    "description": "Filter by set ID (e.g., 'sm11', 'base1')"
                },
                "hp_min": {
                    "type": "integer",
                    "description": "Minimum HP filter"
                },
                "hp_max": {
                    "type": "integer",
                    "description": "Maximum HP filter"
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (default: 10, max: 50)"
                }
            }
        })
    }

    async fn execute(&self, arguments: Value) -> Result<CallToolResult, ToolError> {
        let limit = arguments.get("limit")
            .and_then(|v| v.as_i64())
            .map(|v| v.min(50))
            .unwrap_or(10);

        let query = arguments.get("query").and_then(|v| v.as_str());
        let pokemon_type = arguments.get("type").and_then(|v| v.as_str());
        let supertype = arguments.get("supertype").and_then(|v| v.as_str());
        let rarity = arguments.get("rarity").and_then(|v| v.as_str());
        let set_id = arguments.get("set_id").and_then(|v| v.as_str());
        let hp_min = arguments.get("hp_min").and_then(|v| v.as_i64()).map(|v| v as i32);
        let hp_max = arguments.get("hp_max").and_then(|v| v.as_i64()).map(|v| v as i32);

        let results = self.db.search_cards_filtered(
            query, pokemon_type, supertype, rarity, set_id, hp_min, hp_max, limit,
        )?;

        Ok(format_card_results(&results))
    }
}

fn format_card_results(cards: &[PokemonCard]) -> CallToolResult {
    if cards.is_empty() {
        return CallToolResult {
            content: vec![Content::Text {
                text: "No cards found matching your search criteria.".to_string(),
            }],
            is_error: None,
        };
    }

    let summary = cards
        .iter()
        .map(|card| {
            let hp = card.hp.map(|h| h.to_string()).unwrap_or_else(|| "N/A".into());
            let rarity = card.rarity.as_deref().unwrap_or("Unknown");
            let types = card.types.join(", ");
            format!(
                "- **{}** ({}) | {} | HP: {} | {} | Set: {}",
                card.name, card.id, types, hp, rarity, card.set_id
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    CallToolResult {
        content: vec![Content::Text {
            text: format!("Found {} cards:\n\n{summary}", cards.len()),
        }],
        is_error: None,
    }
}
```

**Get Card by ID** (`tools/get_card_by_id.rs`):

```rust
pub struct GetCardByIdTool {
    db: Arc<Database>,
}

#[async_trait]
impl Tool for GetCardByIdTool {
    fn name(&self) -> &str { "get_card_by_id" }

    fn description(&self) -> &str {
        "Get detailed information about a specific Pokemon card by its ID (e.g., 'base1-4', 'sm11-1')"
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "The card ID (e.g., 'base1-4', 'sm11-1')"
                }
            },
            "required": ["id"]
        })
    }

    async fn execute(&self, arguments: Value) -> Result<CallToolResult, ToolError> {
        let id = arguments.get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidArguments("Missing required 'id' field".into()))?;

        let card = self.db.get_card_by_id(id)?
            .ok_or_else(|| ToolError::ExecutionFailed(format!("Card not found: {id}")))?;

        let json = serde_json::to_string_pretty(&card)?;
        Ok(CallToolResult {
            content: vec![Content::Text { text: json }],
            is_error: None,
        })
    }
}
```

**List Sets** (`tools/list_sets.rs`):

```rust
pub struct ListSetsTool {
    db: Arc<Database>,
}

#[async_trait]
impl Tool for ListSetsTool {
    fn name(&self) -> &str { "list_sets" }

    fn description(&self) -> &str {
        "List all available Pokemon TCG sets with their names, series, and card counts"
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "series": {
                    "type": "string",
                    "description": "Filter sets by series name (e.g., 'Sun & Moon', 'Sword & Shield')"
                }
            }
        })
    }

    async fn execute(&self, arguments: Value) -> Result<CallToolResult, ToolError> {
        let all_sets = self.db.list_sets()?;
        let series_filter = arguments.get("series").and_then(|v| v.as_str());

        let filtered: Vec<_> = all_sets
            .iter()
            .filter(|s| {
                series_filter
                    .map(|f| s.series.eq_ignore_ascii_case(f))
                    .unwrap_or(true)
            })
            .collect();

        let summary = filtered
            .iter()
            .map(|s| {
                let total = s.total.map(|t| t.to_string()).unwrap_or_else(|| "?".into());
                let release = s.release_date.as_deref().unwrap_or("Unknown");
                format!("- **{}** ({}) | {} | {} cards | Released: {}",
                    s.name, s.id, s.series, total, release)
            })
            .collect::<Vec<_>>()
            .join("\n");

        Ok(CallToolResult {
            content: vec![Content::Text {
                text: format!("{} sets found:\n\n{summary}", filtered.len()),
            }],
            is_error: None,
        })
    }
}
```

**Get Set Cards** (`tools/get_set_cards.rs`):

```rust
pub struct GetSetCardsTool {
    db: Arc<Database>,
}

#[async_trait]
impl Tool for GetSetCardsTool {
    fn name(&self) -> &str { "get_set_cards" }

    fn description(&self) -> &str {
        "Get all cards in a specific Pokemon TCG set, ordered by number"
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "set_id": {
                    "type": "string",
                    "description": "The set ID (e.g., 'sm11', 'base1')"
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results (default: 25, max: 100)"
                }
            },
            "required": ["set_id"]
        })
    }

    async fn execute(&self, arguments: Value) -> Result<CallToolResult, ToolError> {
        let set_id = arguments.get("set_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidArguments("Missing 'set_id'".into()))?;

        let limit = arguments.get("limit")
            .and_then(|v| v.as_i64())
            .map(|v| v.min(100))
            .unwrap_or(25);

        let cards = self.db.get_cards_in_set(set_id, limit)?;
        if cards.is_empty() {
            return Err(ToolError::ExecutionFailed(
                format!("No cards found for set: {set_id}")
            ));
        }

        Ok(format_card_results(&cards))
    }
}
```

**Compare Cards** (`tools/compare_cards.rs`):

```rust
pub struct CompareCardsTool {
    db: Arc<Database>,
}

#[async_trait]
impl Tool for CompareCardsTool {
    fn name(&self) -> &str { "compare_cards" }

    fn description(&self) -> &str {
        "Compare two Pokemon cards side-by-side showing stats, attacks, and type differences"
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "card_id_1": { "type": "string", "description": "First card ID" },
                "card_id_2": { "type": "string", "description": "Second card ID" }
            },
            "required": ["card_id_1", "card_id_2"]
        })
    }

    async fn execute(&self, arguments: Value) -> Result<CallToolResult, ToolError> {
        let id1 = arguments.get("card_id_1").and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidArguments("Missing 'card_id_1'".into()))?;
        let id2 = arguments.get("card_id_2").and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidArguments("Missing 'card_id_2'".into()))?;

        let card1 = self.db.get_card_by_id(id1)?
            .ok_or_else(|| ToolError::ExecutionFailed(format!("Card not found: {id1}")))?;
        let card2 = self.db.get_card_by_id(id2)?
            .ok_or_else(|| ToolError::ExecutionFailed(format!("Card not found: {id2}")))?;

        let text = format_comparison(&card1, &card2);
        Ok(CallToolResult {
            content: vec![Content::Text { text }],
            is_error: None,
        })
    }
}

fn format_comparison(a: &PokemonCard, b: &PokemonCard) -> String {
    let hp_a = a.hp.map(|h| h.to_string()).unwrap_or_else(|| "N/A".into());
    let hp_b = b.hp.map(|h| h.to_string()).unwrap_or_else(|| "N/A".into());
    let attacks_a = a.attacks.len();
    let attacks_b = b.attacks.len();
    let rarity_a = a.rarity.as_deref().unwrap_or("Unknown");
    let rarity_b = b.rarity.as_deref().unwrap_or("Unknown");

    format!(
        "## Card Comparison\n\n\
         | Attribute | {} | {} |\n\
         |---|---|---|\n\
         | ID | {} | {} |\n\
         | HP | {} | {} |\n\
         | Types | {} | {} |\n\
         | Supertype | {} | {} |\n\
         | Subtypes | {} | {} |\n\
         | Rarity | {} | {} |\n\
         | Attacks | {} | {} |\n\
         | Retreat Cost | {} | {} |\n\
         | Set | {} | {} |",
        a.name, b.name,
        a.id, b.id,
        hp_a, hp_b,
        a.types.join("/"), b.types.join("/"),
        a.supertype, b.supertype,
        a.subtypes.join(", "), b.subtypes.join(", "),
        rarity_a, rarity_b,
        attacks_a, attacks_b,
        a.converted_retreat_cost.unwrap_or(0),
        b.converted_retreat_cost.unwrap_or(0),
        a.set_id, b.set_id,
    )
}
```

**Get Price Info** (`tools/get_price_info.rs`):

This tool fetches **live pricing** from the Pokemon TCG API. The DB stores card IDs
which map directly to API endpoints (`api.pokemontcg.io/v2/cards/{id}`).

```rust
use crate::domain::pricing::PricingClient;

pub struct GetPriceInfoTool {
    db: Arc<Database>,
    pricing: Arc<PricingClient>,
}

impl GetPriceInfoTool {
    pub fn new(db: Arc<Database>, pricing: Arc<PricingClient>) -> Self {
        Self { db, pricing }
    }
}

#[async_trait]
impl Tool for GetPriceInfoTool {
    fn name(&self) -> &str { "get_price_info" }

    fn description(&self) -> &str {
        "Get live TCGPlayer and Cardmarket pricing for a Pokemon card. \
         Fetches current market prices including low, mid, high, and market values."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "The card ID to get pricing for (e.g., 'base1-4')"
                }
            },
            "required": ["id"]
        })
    }

    async fn execute(&self, arguments: Value) -> Result<CallToolResult, ToolError> {
        let id = arguments.get("id").and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidArguments("Missing 'id'".into()))?;

        // Verify card exists in our DB first
        let card = self.db.get_card_by_id(id)?
            .ok_or_else(|| ToolError::ExecutionFailed(format!("Card not found: {id}")))?;

        // Fetch live pricing from Pokemon TCG API
        let pricing_data = self.pricing.fetch_pricing(id).await
            .map_err(|e| ToolError::ExecutionFailed(
                format!("Could not fetch pricing for {id}: {e}")
            ))?;

        let mut text = format!("## Pricing for {} ({})\n\n", card.name, card.id);

        match &pricing_data.tcgplayer {
            Some(tcg) => {
                text.push_str("### TCGPlayer\n");
                if let Some(updated) = &tcg.updated_at {
                    text.push_str(&format!("Last updated: {updated}\n"));
                }
                if let Some(prices) = &tcg.prices {
                    text.push_str(&format_price_value(prices));
                }
            }
            None => text.push_str("No TCGPlayer pricing available.\n"),
        }

        match &pricing_data.cardmarket {
            Some(cm) => {
                text.push_str("\n### Cardmarket\n");
                if let Some(updated) = &cm.updated_at {
                    text.push_str(&format!("Last updated: {updated}\n"));
                }
                if let Some(prices) = &cm.prices {
                    text.push_str(&format_price_value(prices));
                }
            }
            None => text.push_str("\nNo Cardmarket pricing available.\n"),
        }

        Ok(CallToolResult {
            content: vec![Content::Text { text }],
            is_error: None,
        })
    }
}

/// Format a serde_json::Value containing price keys into readable text.
/// Handles dynamic keys like "holofoil", "reverseHolofoil", "normal",
/// "averageSellPrice", "trendPrice", etc.
fn format_price_value(prices: &serde_json::Value) -> String {
    let mut output = String::new();
    if let Some(obj) = prices.as_object() {
        for (key, value) in obj {
            if let Some(inner_obj) = value.as_object() {
                // Nested pricing (tcgplayer style): { "holofoil": { "low": 350, ... } }
                output.push_str(&format!("  **{}**:\n", key));
                for (price_key, price_val) in inner_obj {
                    if let Some(n) = price_val.as_f64() {
                        output.push_str(&format!("    {}: ${:.2}\n", price_key, n));
                    }
                }
            } else if let Some(n) = value.as_f64() {
                // Flat pricing (cardmarket style): { "averageSellPrice": 15.67 }
                output.push_str(&format!("  {}: ${:.2}\n", key, n));
            }
        }
    }
    output
}
```

### 9. Wire Everything Up (`main.rs`, updated)

```rust
use std::sync::Arc;

mod protocol;
mod transport;
mod registry;
mod tools;
mod domain;

use domain::db::Database;
use domain::pricing::PricingClient;
use registry::ToolRegistry;
use tools::{
    search_cards::SearchCardsTool,
    get_card_by_id::GetCardByIdTool,
    list_sets::ListSetsTool,
    get_set_cards::GetSetCardsTool,
    compare_cards::CompareCardsTool,
    get_price_info::GetPriceInfoTool,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .init();

    // Open SQLite database (read-only)
    let db_path = std::env::var("DATABASE_PATH")
        .unwrap_or_else(|_| "database/pokemon-data.sqlite3.db".to_string());

    let db = Arc::new(Database::open(db_path.as_ref())?);
    tracing::info!(
        "Database opened: {} cards, {} sets",
        db.card_count()?,
        db.set_count()?
    );

    // Create pricing client
    let pricing = Arc::new(PricingClient::new());

    // Register tools
    let mut registry = ToolRegistry::new();
    registry.register(SearchCardsTool::new(Arc::clone(&db)));
    registry.register(GetCardByIdTool::new(Arc::clone(&db)));
    registry.register(ListSetsTool::new(Arc::clone(&db)));
    registry.register(GetSetCardsTool::new(Arc::clone(&db)));
    registry.register(CompareCardsTool::new(Arc::clone(&db)));
    registry.register(GetPriceInfoTool::new(Arc::clone(&db), Arc::clone(&pricing)));

    tracing::info!("Registered {} tools", registry.tool_count());

    transport::stdio::run_stdio(registry).await
}
```

## File Structure

```
apps/mcp-server/
├── Cargo.toml                       # +rusqlite, +reqwest
├── database/
│   └── pokemon-data.sqlite3.db      # Replicated from database/ root
├── src/
│   ├── main.rs                      # Updated: opens DB, creates pricing client
│   ├── domain/
│   │   ├── mod.rs                   # pub mod card, set, db, pricing, error;
│   │   ├── card.rs                  # ~100 lines: PokemonCard + nested types
│   │   ├── set.rs                   # ~30 lines: CardSet + SetImages
│   │   ├── db.rs                    # ~200 lines: Database struct + queries + row_to_*
│   │   ├── pricing.rs              # ~80 lines: PricingClient + API types
│   │   └── error.rs                 # ~30 lines: DomainError enum
│   ├── tools/
│   │   ├── mod.rs                   # pub mod for all 6 tools
│   │   ├── search_cards.rs          # ~80 lines
│   │   ├── get_card_by_id.rs        # ~50 lines
│   │   ├── list_sets.rs             # ~60 lines
│   │   ├── get_set_cards.rs         # ~50 lines
│   │   ├── compare_cards.rs         # ~80 lines
│   │   └── get_price_info.rs        # ~100 lines
│   └── (protocol/, transport/, registry/ unchanged from SPEC-01/02)
└── tests/
    ├── db_tests.rs                  # SQLite query tests
    └── tool_tests.rs               # Tool execution tests
```

## Acceptance Criteria

- [ ] `cargo build` compiles with `rusqlite` (bundled) and `reqwest` (json) dependencies
- [ ] `cargo clippy -- -D warnings` reports 0 warnings
- [ ] Database opens read-only; startup log shows `19818 cards, 170 sets`
- [ ] `search_cards` with `{"query":"charizard"}` returns ≥5 results
- [ ] `search_cards` with `{"type":"Fire","hp_min":100}` returns only Fire cards with HP≥100
- [ ] `get_card_by_id` with `{"id":"base1-4"}` returns Charizard with parsed attacks, abilities, weaknesses
- [ ] `get_card_by_id` with nonexistent ID returns `isError: true` content
- [ ] `list_sets` returns 170 sets
- [ ] `list_sets` with `{"series":"Sun & Moon"}` returns only Sun & Moon sets
- [ ] `get_set_cards` with `{"set_id":"base1"}` returns Base Set cards ordered by number
- [ ] `compare_cards` with two valid IDs returns a markdown comparison table
- [ ] `get_price_info` with `{"id":"base1-4"}` returns live TCGPlayer and Cardmarket pricing
- [ ] `get_price_info` gracefully returns error message when API is unreachable (timeout)
- [ ] JSON-in-TEXT columns (subtypes, types, attacks, abilities, weaknesses) parse correctly
- [ ] `evolves_from` column (JSON string with quotes) parses to clean `Option<String>`
- [ ] `cargo test` passes: DB query tests, row conversion tests, tool execution tests
- [ ] No `unwrap()` in non-test code
- [ ] Binary starts and responds within 1 second (no bulk loading — queries are on-demand)

## Verification

```bash
# Build
cargo build --manifest-path apps/mcp-server/Cargo.toml

# Lint
cargo clippy --manifest-path apps/mcp-server/Cargo.toml -- -D warnings

# Test
cargo test --manifest-path apps/mcp-server/Cargo.toml

# Integration: search for charizard
printf '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}},"id":1}\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_cards","arguments":{"query":"charizard"}},"id":2}\n' \
  | DATABASE_PATH=./apps/mcp-server/database/pokemon-data.sqlite3.db \
    cargo run --manifest-path apps/mcp-server/Cargo.toml 2>/dev/null \
  | tail -1 \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
text = d['result']['content'][0]['text']
assert 'Charizard' in text, f'Expected Charizard in results'
print('PASS: search_cards charizard')
"

# Integration: get card by ID
printf '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}},"id":1}\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_card_by_id","arguments":{"id":"base1-4"}},"id":2}\n' \
  | DATABASE_PATH=./apps/mcp-server/database/pokemon-data.sqlite3.db \
    cargo run --manifest-path apps/mcp-server/Cargo.toml 2>/dev/null \
  | tail -1 \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
card = json.loads(d['result']['content'][0]['text'])
assert card['name'] == 'Charizard', f'Expected Charizard, got {card[\"name\"]}'
assert len(card['attacks']) > 0, 'Expected attacks to be parsed'
print('PASS: get_card_by_id base1-4')
"

# Integration: list sets
printf '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}},"id":1}\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_sets","arguments":{}},"id":2}\n' \
  | DATABASE_PATH=./apps/mcp-server/database/pokemon-data.sqlite3.db \
    cargo run --manifest-path apps/mcp-server/Cargo.toml 2>/dev/null \
  | tail -1 \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
text = d['result']['content'][0]['text']
count = int(text.split(' sets')[0])
assert count == 170, f'Expected 170 sets, got {count}'
print(f'PASS: list_sets ({count} sets)')
"

# Integration: pricing (requires network access)
printf '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}},"id":1}\n{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_price_info","arguments":{"id":"base1-4"}},"id":2}\n' \
  | DATABASE_PATH=./apps/mcp-server/database/pokemon-data.sqlite3.db \
    cargo run --manifest-path apps/mcp-server/Cargo.toml 2>/dev/null \
  | tail -1 \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
text = d['result']['content'][0]['text']
assert 'TCGPlayer' in text or 'isError' in str(d['result']), 'Expected pricing or error'
print('PASS: get_price_info')
"
```

## Dependencies

- SPEC-01: Transport & Protocol
- SPEC-02: Tool/Resource Registry

## Key Learning Moments

### 1. Why `rusqlite` instead of `sqlx`?

`sqlx` is async and supports compile-time query verification — great for production APIs.
But for a read-only MCP server with simple queries, `rusqlite` is simpler:

```
rusqlite                          sqlx
├── Synchronous API               ├── Async API
├── No macros needed               ├── sqlx::query!() macro
├── No build-time DB connection    ├── Needs DATABASE_URL at compile time
├── Lightweight (~100KB)           ├── Heavier (~500KB+)
└── Perfect for read-only          └── Better for read-write with pools
```

Since MCP tool execution is already async (via `async_trait`), the synchronous SQLite
calls happen on the tokio thread — fine for read-only queries that complete in microseconds.

### 2. JSON-in-TEXT columns: the parsing pattern

The SQLite schema stores arrays and objects as JSON text in TEXT columns:

```
subtypes column: '["Stage 2"]'           → Vec<String>
attacks column:  '[{"name":"Fire Spin",...}]' → Vec<Attack>
legalities column: '{"unlimited":"Legal"}'   → Legalities struct
evolves_from column: '"Charmeleon"'       → String (note: JSON string WITH quotes)
```

The `parse_json_array` and `parse_json_object` helpers handle this uniformly:

```rust
fn parse_json_array<T: DeserializeOwned>(row: &Row, column: &str) -> Vec<T> {
    row.get::<_, Option<String>>(column)  // Step 1: Get TEXT as Option<String>
        .ok()                              // Step 2: Convert Result → Option
        .flatten()                         // Step 3: Option<Option<String>> → Option<String>
        .and_then(|s| serde_json::from_str(&s).ok())  // Step 4: Parse JSON
        .unwrap_or_default()               // Step 5: Fall back to empty Vec
}
```

Each step is null-safe. No panics. No unwraps. If the column is NULL or contains
malformed JSON, you get an empty vec or None — never a crash.

### 3. Why `Arc<Database>` instead of cloning the Connection?

`rusqlite::Connection` is not `Clone`. You can't just pass it to multiple tools.
`Arc` (Atomic Reference Counting) provides shared ownership:

```rust
let db = Arc::new(Database::open(...)?);
let tool_a = SearchCardsTool::new(Arc::clone(&db));    // +1 refcount
let tool_b = GetCardByIdTool::new(Arc::clone(&db));    // +1 refcount
// All tools share the same Connection; no copying
```

Note: `rusqlite::Connection` is NOT `Sync` by default. Since our MCP server handles
one request at a time on the stdio transport, this isn't a problem. For Phase 4 (SSE
with concurrent connections), we'll need `Arc<Mutex<Database>>` or one connection per
request.

### 4. Dynamic SQL with parameterized queries

The `search_cards_filtered` method builds SQL dynamically based on which filters are
provided. This is safe because:

- Column names are hardcoded strings (not user input)
- Values go through `?` parameter binding (SQL injection impossible)
- The `conditions` vec is built programmatically from known-safe strings

```rust
// SAFE: "types LIKE ?" with bound parameter
conditions.push("types LIKE ?");
param_values.push(Box::new(format!("%\"{t}\"%")));

// UNSAFE (never do this): format!("types LIKE '%{t}%'")
```

### 5. Live pricing as an async boundary

The `get_price_info` tool is the only tool that makes network calls. This teaches:

- `reqwest::Client` with timeout configuration
- `.send().await?.json::<T>().await?` chaining
- Error conversion: `reqwest::Error` → `DomainError::Http` → `ToolError`
- Graceful degradation: if the API is down, return a clear error message
