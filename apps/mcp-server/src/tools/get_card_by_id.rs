use crate::domains::db::Database;
use crate::protocol::mcp::{CallToolResult, Content};
use crate::registry::tool::{Tool, ToolError};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;

pub struct GetCardByIdTool {
    db: Arc<Database>,
}

impl GetCardByIdTool {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }
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
