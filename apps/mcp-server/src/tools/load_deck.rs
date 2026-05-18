use std::path::Path;
use std::sync::Arc;

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
    fn name(&self) -> &str {
        "load_deck"
    }

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
            let card = match self.db.get_card_by_id(&entry.id) {
                Ok(card) => card,
                Err(e) => {
                    tracing::warn!(card_id = %entry.id, error = %e, "DB error during card lookup; card will be unenriched");
                    None
                }
            };
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
