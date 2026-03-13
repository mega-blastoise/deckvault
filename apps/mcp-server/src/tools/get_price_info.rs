use crate::domains::db::Database;
use crate::domains::pricing::PricingClient;
use crate::protocol::mcp::{CallToolResult, Content};
use crate::registry::tool::{Tool, ToolError};

use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;

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
