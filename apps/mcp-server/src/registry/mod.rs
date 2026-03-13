pub mod tool;

use crate::protocol::mcp::CallToolResult;
use crate::registry::tool::{Tool, ToolError};

use std::collections::HashMap;
use serde_json::Value;

/// A container that stores tools and dispatches tool calls
/// Key insight: `register` accepts `impl Tool + 'static` — the `'static` bound means the
/// tool cannot borrow short-lived data. 
/// Each tool must **own** its data. 
/// This is the simplest lifetime model and appropriate for tools initialized at startup.
pub struct ToolRegistry {
    tools: HashMap<String, Box<dyn Tool>>,
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }

    pub fn register(&mut self, tool: impl Tool + 'static) {
        self.tools.insert(tool.name().to_string(), Box::new(tool));
    }

    pub fn list_tools(&self) -> Vec<ToolInfo> {
        self.tools
            .values()
            .map(|t| ToolInfo {
                name: t.name().to_string(),
                description: t.description().to_string(),
                input_schema: t.input_schema(),
            })
            .collect()
    }

    pub async fn call_tool(
        &self,
        name: &str,
        arguments: Value,
    ) -> Result<CallToolResult, ToolError> {
        let tool = self.tools.get(name).ok_or_else(|| {
            ToolError::ExecutionFailed(format!("Unknown tool: {name}"))
        })?;
        tool.execute(arguments).await
    }

    pub fn tool_count(&self) -> u8 {
        self.tools.len() as u8
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}