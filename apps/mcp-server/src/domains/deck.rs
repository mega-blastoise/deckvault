use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::domains::card::PokemonCard;
use crate::domains::db::Database;

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
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
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
                message: format!(
                    "Card {} has invalid quantity {}",
                    entry.id, entry.quantity
                ),
                card_id: Some(entry.id.clone()),
            });
        }
    }

    // R5: format string
    if deck.format != "standard" {
        violations.push(ValidationViolation {
            rule: "R5".to_string(),
            message: format!(
                "Unknown format \"{}\"; only \"standard\" is supported",
                deck.format
            ),
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
                if let Some(ref reg_mark) = card.regulation_mark {
                    if !reg_mark.is_empty()
                        && !STANDARD_LEGAL_MARKS.contains(&reg_mark.as_str())
                    {
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
            Err(e) => {
                tracing::warn!(card_id = %entry.id, error = %e, "DB error during card lookup; treating as unknown");
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
