use crate::domains::db::Database;
use crate::domains::card::PokemonCard;
use crate::protocol::mcp::{CallToolResult, Content};
use crate::registry::tool::{Tool, ToolError};

use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;

pub struct CompareCardsTool {
    db: Arc<Database>,
}

impl CompareCardsTool {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }
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