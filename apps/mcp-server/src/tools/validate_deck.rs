use std::path::Path;
use std::sync::Arc;

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
    fn name(&self) -> &str {
        "validate_deck"
    }

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
