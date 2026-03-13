use crate::domains::db::Database;
use crate::protocol::mcp::{CallToolResult, Content};
use crate::registry::tool::{Tool, ToolError};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;

pub struct GetSetCardsTool {
    db: Arc<Database>,
}

impl GetSetCardsTool {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }
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

fn format_card_results(cards: &[crate::domains::card::PokemonCard]) -> CallToolResult {
    let content = cards.iter().map(|card| {
        let hp = card.hp.map(|h| h.to_string()).unwrap_or_else(|| "?".into());
        let types = if card.types.is_empty() { "Unknown".into() } else { card.types.join("/") };
        let rarity = card.rarity.as_deref().unwrap_or("Unknown");
        Content::Text {
            text: format!("- **{}** (ID: {}) | HP: {} | Type: {} | Rarity: {}",
                card.name, card.id, hp, types, rarity)
        }
    }).collect();

    CallToolResult {
        content,
        is_error: None,
    }
}
