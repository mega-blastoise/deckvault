# SPEC_02: MCP Server Extensions — Deck Domain

## Context

The existing `pokemon-mcp-server` exposes card and set tools backed by a local SQLite
database. This spec adds two new tools to the server: `load_deck` and `validate_deck`.
Both operate on the local filesystem and the existing card database — no new external
dependencies or network calls.

These tools let the CLI agent load a deck with full card enrichment in a single MCP call,
and independently validate format legality before the session begins.

---

## Prerequisites

- SPEC_01 complete (deck file format defined)
- `pokemon-mcp-server` Phase 1–3 complete (tools registry, SQLite domain, existing tools)

---

## New Dependencies

Add to `apps/mcp-server/Cargo.toml`:

```toml
[dependencies]
toml = "0.8"    # TOML parsing
```

`serde_json` is already present. `rusqlite` is already present.
No new network dependencies.

---

## Requirements

### 1. New Domain Types (`src/domains/deck.rs`)

```rust
use serde::{Deserialize, Serialize};
use crate::domains::card::PokemonCard;

/// Raw deck file as parsed from TOML or JSON — no card enrichment
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DeckFile {
    pub name: String,
    pub format: String,
    pub regulation_marks: Vec<String>,
    pub cards: Vec<DeckCardEntry>,
    pub meta: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DeckCardEntry {
    pub id: String,
    pub quantity: u32,
}

/// Deck with full card data resolved from the database
#[derive(Debug, Clone, Serialize)]
pub struct EnrichedDeck {
    pub name: String,
    pub format: String,
    pub regulation_marks: Vec<String>,
    pub total_cards: u32,
    pub cards: Vec<EnrichedDeckCard>,
    pub meta: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EnrichedDeckCard {
    pub quantity: u32,
    /// Full card data from SQLite; None if card ID not found in database
    pub card: Option<PokemonCard>,
    /// The original ID from the deck file (preserved even if lookup failed)
    pub id: String,
}

/// Result of format legality validation
#[derive(Debug, Clone, Serialize)]
pub struct DeckValidationReport {
    pub valid: bool,
    pub violations: Vec<ValidationViolation>,
    pub total_cards: u32,
    pub unknown_card_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ValidationViolation {
    pub rule: String,
    pub message: String,
    /// The card ID involved, if applicable
    pub card_id: Option<String>,
}
```

Register the module in `src/domains/mod.rs`:
```rust
pub mod deck;
```

### 2. File Parsing Helpers (`src/domains/deck.rs`, continued)

```rust
use std::path::Path;

#[derive(Debug)]
pub enum ParseError {
    Io(std::io::Error),
    Toml(toml::de::Error),
    Json(serde_json::Error),
    UnsupportedExtension(String),
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e) => write!(f, "IO error: {e}"),
            Self::Toml(e) => write!(f, "TOML parse error: {e}"),
            Self::Json(e) => write!(f, "JSON parse error: {e}"),
            Self::UnsupportedExtension(ext) => write!(f, "Unsupported file extension: {ext}"),
        }
    }
}

pub fn parse_deck_file(path: &Path) -> Result<DeckFile, ParseError> {
    let contents = std::fs::read_to_string(path).map_err(ParseError::Io)?;
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    match ext {
        "toml" => toml::from_str(&contents).map_err(ParseError::Toml),
        "json" => serde_json::from_str(&contents).map_err(ParseError::Json),
        other => Err(ParseError::UnsupportedExtension(other.to_string())),
    }
}
```

### 3. Validation Logic (`src/domains/deck.rs`, continued)

```rust
use crate::domains::db::Database;

/// Legal regulation marks for current Standard format (HIJ rotation)
const STANDARD_LEGAL_MARKS: &[&str] = &["H", "I", "J"];

pub fn validate_deck(deck: &DeckFile, db: &Database) -> DeckValidationReport {
    let mut violations = Vec::new();
    let mut unknown_ids = Vec::new();

    // R1: total count
    let total: u32 = deck.cards.iter().map(|c| c.quantity).sum();
    if total != 60 {
        violations.push(ValidationViolation {
            rule: "R1".to_string(),
            message: format!("Deck contains {total} cards; exactly 60 required"),
            card_id: None,
        });
    }

    // R2: duplicate IDs
    let mut seen = std::collections::HashSet::new();
    for entry in &deck.cards {
        if !seen.insert(&entry.id) {
            violations.push(ValidationViolation {
                rule: "R2".to_string(),
                message: format!("Duplicate card ID: {}", entry.id),
                card_id: Some(entry.id.clone()),
            });
        }
    }

    // R3: quantity bounds
    for entry in &deck.cards {
        if entry.quantity == 0 || entry.quantity > 60 {
            violations.push(ValidationViolation {
                rule: "R3".to_string(),
                message: format!("Card {} has invalid quantity {}", entry.id, entry.quantity),
                card_id: Some(entry.id.clone()),
            });
        }
    }

    // R4: four-copy limit (requires DB lookup to detect Basic Energy)
    // R5: format string
    if deck.format != "standard" {
        violations.push(ValidationViolation {
            rule: "R5".to_string(),
            message: format!("Unknown format \"{}\"; only \"standard\" is supported", deck.format),
            card_id: None,
        });
    }

    // R6: regulation marks declared
    if deck.regulation_marks.is_empty() {
        violations.push(ValidationViolation {
            rule: "R6".to_string(),
            message: "regulation_marks must not be empty".to_string(),
            card_id: None,
        });
    }

    // Enrich cards from DB for R4 and legality checks
    for entry in &deck.cards {
        match db.get_card_by_id(&entry.id) {
            Ok(Some(card)) => {
                let is_basic_energy = card.supertype == "Energy"
                    && card.subtypes.iter().any(|s| s == "Basic");

                // R4: four-copy limit
                if !is_basic_energy && entry.quantity > 4 {
                    violations.push(ValidationViolation {
                        rule: "R4".to_string(),
                        message: format!(
                            "\"{}\" ({}) has quantity {}; max 4 for non-Basic Energy",
                            card.name, entry.id, entry.quantity
                        ),
                        card_id: Some(entry.id.clone()),
                    });
                }

                // Legality: regulation mark
                if let Some(reg_mark) = extract_regulation_mark(&card) {
                    if !STANDARD_LEGAL_MARKS.contains(&reg_mark.as_str()) {
                        violations.push(ValidationViolation {
                            rule: "LEGALITY".to_string(),
                            message: format!(
                                "\"{}\" ({}) has regulation mark {}; not legal in current Standard (H/I/J)",
                                card.name, entry.id, reg_mark
                            ),
                            card_id: Some(entry.id.clone()),
                        });
                    }
                }
            }
            Ok(None) => {
                unknown_ids.push(entry.id.clone());
            }
            Err(_) => {
                unknown_ids.push(entry.id.clone());
            }
        }
    }

    DeckValidationReport {
        valid: violations.is_empty() && unknown_ids.is_empty(),
        violations,
        total_cards: total,
        unknown_card_ids: unknown_ids,
    }
}

fn extract_regulation_mark(card: &crate::domains::card::PokemonCard) -> Option<String> {
    // Regulation mark is stored in the `rules` field for modern cards
    // Format: "You may have up to 4 copies..." is NOT the regulation mark
    // Actual regulation mark is stored separately — check the DB schema
    // If not directly available, fall back to None (treat as unknown/legal)
    // TODO: confirm column name from database schema during implementation
    None
}
```

> **Implementation note for `extract_regulation_mark`:** The SQLite schema stores the
> regulation mark in a `regulation_mark TEXT` column on `pokemon_cards`. Add this field
> to `PokemonCard` in `domains/card.rs` if not already present, and return it here.
> Check `apps/mcp-server/src/domains/db.rs` query for the column mapping.

### 4. `load_deck` Tool (`src/tools/load_deck.rs`)

Reads a deck file, enriches all card IDs against the SQLite database, and returns the
full `EnrichedDeck` as a JSON content block.

```rust
use std::sync::Arc;
use std::path::Path;
use async_trait::async_trait;
use serde_json::{json, Value};
use crate::domains::db::Database;
use crate::domains::deck::{parse_deck_file, EnrichedDeck, EnrichedDeckCard};
use crate::protocol::mcp::{CallToolResult, Content};
use crate::registry::tool::{Tool, ToolError};

pub struct LoadDeckTool {
    db: Arc<Database>,
}

impl LoadDeckTool {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl Tool for LoadDeckTool {
    fn name(&self) -> &str { "load_deck" }

    fn description(&self) -> &str {
        "Load a deck file (.toml or .json) from the given path. Returns the full deck \
         with each card enriched from the card database (name, HP, attacks, abilities, \
         regulation mark, set). Use this at the start of a session to load context."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "required": ["path"],
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Absolute or relative path to the deck TOML or JSON file"
                }
            }
        })
    }

    async fn execute(&self, arguments: Value) -> Result<CallToolResult, ToolError> {
        let path_str = arguments
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidArguments("path is required".to_string()))?;

        let path = Path::new(path_str);
        let deck_file = parse_deck_file(path).map_err(|e| {
            ToolError::ExecutionFailed(format!("Failed to parse deck file: {e}"))
        })?;

        let mut enriched_cards = Vec::new();
        for entry in &deck_file.cards {
            let card = self.db.get_card_by_id(&entry.id).ok().flatten();
            enriched_cards.push(EnrichedDeckCard {
                id: entry.id.clone(),
                quantity: entry.quantity,
                card,
            });
        }

        let total: u32 = deck_file.cards.iter().map(|c| c.quantity).sum();
        let enriched = EnrichedDeck {
            name: deck_file.name,
            format: deck_file.format,
            regulation_marks: deck_file.regulation_marks,
            total_cards: total,
            cards: enriched_cards,
            meta: deck_file.meta,
        };

        let json_text = serde_json::to_string_pretty(&enriched)
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        Ok(CallToolResult {
            content: vec![Content::Text { text: json_text }],
            is_error: None,
        })
    }
}
```

### 5. `validate_deck` Tool (`src/tools/validate_deck.rs`)

Parses and validates a deck file, returning a structured legality report.

```rust
use std::sync::Arc;
use std::path::Path;
use async_trait::async_trait;
use serde_json::{json, Value};
use crate::domains::db::Database;
use crate::domains::deck::{parse_deck_file, validate_deck};
use crate::protocol::mcp::{CallToolResult, Content};
use crate::registry::tool::{Tool, ToolError};

pub struct ValidateDeckTool {
    db: Arc<Database>,
}

impl ValidateDeckTool {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl Tool for ValidateDeckTool {
    fn name(&self) -> &str { "validate_deck" }

    fn description(&self) -> &str {
        "Validate a deck file for Standard format legality. Checks: exactly 60 cards, \
         no duplicate IDs, quantity limits (max 4 for non-Basic Energy), and regulation \
         marks for current Standard (H/I/J). Returns a structured violation report."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "required": ["path"],
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Absolute or relative path to the deck TOML or JSON file"
                }
            }
        })
    }

    async fn execute(&self, arguments: Value) -> Result<CallToolResult, ToolError> {
        let path_str = arguments
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidArguments("path is required".to_string()))?;

        let path = Path::new(path_str);
        let deck_file = parse_deck_file(path).map_err(|e| {
            ToolError::ExecutionFailed(format!("Failed to parse deck file: {e}"))
        })?;

        let report = validate_deck(&deck_file, &self.db);
        let json_text = serde_json::to_string_pretty(&report)
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        Ok(CallToolResult {
            content: vec![Content::Text { text: json_text }],
            is_error: Some(!report.valid),
        })
    }
}
```

### 6. Register New Tools

In `src/main.rs` (or wherever tools are registered into the registry):

```rust
use crate::tools::load_deck::LoadDeckTool;
use crate::tools::validate_deck::ValidateDeckTool;

// Alongside existing tool registrations:
registry.register(Box::new(LoadDeckTool::new(Arc::clone(&db))));
registry.register(Box::new(ValidateDeckTool::new(Arc::clone(&db))));
```

Add module declarations in `src/tools/mod.rs`:
```rust
pub mod load_deck;
pub mod validate_deck;
```

---

## File Structure

```
apps/mcp-server/src/
├── domains/
│   ├── mod.rs           # MODIFIED — add pub mod deck;
│   ├── card.rs          # MODIFIED — add regulation_mark field if missing
│   └── deck.rs          # NEW — DeckFile, EnrichedDeck, validation logic
├── tools/
│   ├── mod.rs           # MODIFIED — add pub mod load_deck; pub mod validate_deck;
│   ├── load_deck.rs     # NEW
│   └── validate_deck.rs # NEW
└── main.rs              # MODIFIED — register two new tools
```

---

## Acceptance Criteria

- [ ] `cargo build` compiles with zero errors after changes
- [ ] `cargo clippy -- -D warnings` reports zero warnings
- [ ] `tools/list` response includes `load_deck` and `validate_deck` entries
- [ ] `load_deck` with a valid TOML deck path returns an `EnrichedDeck` JSON with all
      card IDs resolved to their full card data
- [ ] `load_deck` with a `.json` deck path returns identical structure
- [ ] `load_deck` with a non-existent path returns a `ToolError` (not a crash)
- [ ] `validate_deck` on a 59-card deck returns `valid: false` with one R1 violation
- [ ] `validate_deck` on a deck with a non–Standard card returns a LEGALITY violation
- [ ] `validate_deck` on the canonical example deck from SPEC_01 returns `valid: true`
- [ ] `cargo test` passes with no regressions to existing tools

---

## Dependencies

- SPEC_01 (deck file format)
- MCP server Phase 1–3 (tool registry, SQLite domain)

---

## Verification

```bash
# Build
cargo build --manifest-path apps/mcp-server/Cargo.toml

# Lint
cargo clippy --manifest-path apps/mcp-server/Cargo.toml -- -D warnings

# Test tools list includes new tools
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
  | cargo run --manifest-path apps/mcp-server/Cargo.toml 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
names = [t['name'] for t in d['result']['tools']]
assert 'load_deck' in names, 'load_deck missing'
assert 'validate_deck' in names, 'validate_deck missing'
print('PASS')
"

# Test load_deck on example file
DECK_PATH="$(pwd)/apps/deck-cli/decks/example.toml"
echo "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"load_deck\",\"arguments\":{\"path\":\"$DECK_PATH\"}},\"id\":2}" \
  | cargo run --manifest-path apps/mcp-server/Cargo.toml 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
deck = json.loads(d['result']['content'][0]['text'])
assert deck['total_cards'] == 60, f'Expected 60, got {deck[\"total_cards\"]}'
print('PASS — total_cards:', deck['total_cards'])
"

# Test validate_deck on example file
echo "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"validate_deck\",\"arguments\":{\"path\":\"$DECK_PATH\"}},\"id\":3}" \
  | cargo run --manifest-path apps/mcp-server/Cargo.toml 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
report = json.loads(d['result']['content'][0]['text'])
assert report['valid'] == True, f'Expected valid deck, got violations: {report[\"violations\"]}'
print('PASS — deck is valid')
"
```
