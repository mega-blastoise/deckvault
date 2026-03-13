use async_trait::async_trait;
use serde_json::Value;
use thiserror::Error;
use crate::{domains::error::DomainError, protocol::mcp::CallToolResult};

/// Define the contract every tool must satisfy:
/// Why these bounds?
/// Box<dyn Tool + Send + Sync>
///              │      │
///              │      └── Safe to reference from multiple threads
///              └── Safe to send across thread boundaries
///
/// Both are required because:
/// - The Handler may run on different tokio tasks (Send)
/// - Multiple requests may reference the registry concurrently (Sync)
/// 

#[derive(Debug, Error)]
pub enum ToolError {
    #[error("Invalid arguments: {0}")]
    InvalidArguments(String),

    #[error("Tool execution failed: {0}")]
    ExecutionFailed(String),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

impl From<DomainError> for ToolError {
    fn from(e: DomainError) -> Self {
        ToolError::ExecutionFailed(e.to_string())
    }
}

#[async_trait]
pub trait Tool: Send + Sync {
    /// Unique name used in `tools/call` requests (e.g., "search_cards")
    fn name(&self) -> &str;

    /// Human-readable description shown to the AI
    fn description(&self) -> &str;

    /// JSON Schema describing the tool's expected input parameters
    fn input_schema(&self) -> Value;

    /// Execute the tool with the given arguments, returning MCP content
    async fn execute(&self, arguments: Value) -> Result<CallToolResult, ToolError>;
}