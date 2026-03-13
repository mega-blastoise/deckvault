use crate::domains::db::Database;
use crate::protocol::mcp::{CallToolResult, Content};
use crate::registry::tool::{Tool, ToolError};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;

pub struct ListSetsTool {
    db: Arc<Database>,
}

impl ListSetsTool {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }
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