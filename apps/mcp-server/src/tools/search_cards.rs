use std::sync::Arc;
use async_trait::async_trait;
use serde_json::{json, Value};
use crate::domains::db::Database;
use crate::domains::card::PokemonCard;
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
                },
                "standard_only": {
                    "type": "boolean",
                    "description": "When true, restrict results to current Standard-legal cards (regulation marks H, I, J). Basic Energy is always included. Default: false."
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
        let standard_only = arguments.get("standard_only")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let results = self.db.search_cards_filtered(
            query, pokemon_type, supertype, rarity, set_id, hp_min, hp_max, limit, standard_only,
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
