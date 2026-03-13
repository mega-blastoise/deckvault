use pokemon_mcp_server::registry::ToolRegistry;
use pokemon_mcp_server::registry::tool::{Tool, ToolError};
use pokemon_mcp_server::protocol::mcp::{CallToolResult, Content};
use async_trait::async_trait;
use serde_json::{json, Value};

// ── Stub tool for registry tests ─────────────────────────────────────────────

struct PingTool;

#[async_trait]
impl Tool for PingTool {
    fn name(&self) -> &str { "ping_tool" }
    fn description(&self) -> &str { "Returns pong" }
    fn input_schema(&self) -> Value { json!({"type": "object", "properties": {}}) }

    async fn execute(&self, _arguments: Value) -> Result<CallToolResult, ToolError> {
        Ok(CallToolResult {
            content: vec![Content::Text { text: "pong".to_string() }],
            is_error: None,
        })
    }
}

struct FailTool;

#[async_trait]
impl Tool for FailTool {
    fn name(&self) -> &str { "fail_tool" }
    fn description(&self) -> &str { "Always fails" }
    fn input_schema(&self) -> Value { json!({"type": "object"}) }

    async fn execute(&self, _arguments: Value) -> Result<CallToolResult, ToolError> {
        Err(ToolError::ExecutionFailed("intentional failure".to_string()))
    }
}

// ── Registry behavior tests ───────────────────────────────────────────────────

#[test]
fn registered_tool_appears_in_list() {
    let mut registry = ToolRegistry::new();
    registry.register(PingTool);

    let tools = registry.list_tools();
    assert_eq!(tools.len(), 1);
    assert_eq!(tools[0].name, "ping_tool");
    assert_eq!(tools[0].description, "Returns pong");
}

#[test]
fn multiple_tools_all_appear_in_list() {
    let mut registry = ToolRegistry::new();
    registry.register(PingTool);
    registry.register(FailTool);

    let tools = registry.list_tools();
    assert_eq!(tools.len(), 2);

    let names: Vec<&str> = tools.iter().map(|t| t.name.as_str()).collect();
    assert!(names.contains(&"ping_tool"));
    assert!(names.contains(&"fail_tool"));
}

#[test]
fn tool_count_matches_registered_tools() {
    let mut registry = ToolRegistry::new();
    assert_eq!(registry.tool_count(), 0);
    registry.register(PingTool);
    assert_eq!(registry.tool_count(), 1);
    registry.register(FailTool);
    assert_eq!(registry.tool_count(), 2);
}

#[tokio::test]
async fn calling_registered_tool_dispatches_to_execute() {
    let mut registry = ToolRegistry::new();
    registry.register(PingTool);

    let result = registry.call_tool("ping_tool", json!({})).await.unwrap();
    assert!(result.is_error.is_none());
    assert_eq!(result.content.len(), 1);
    let Content::Text { text } = &result.content[0];
    assert_eq!(text, "pong");
}

#[tokio::test]
async fn calling_unknown_tool_returns_execution_failed_error() {
    let registry = ToolRegistry::new();
    let err = registry.call_tool("does_not_exist", json!({})).await.unwrap_err();
    assert!(matches!(err, ToolError::ExecutionFailed(_)));
}

#[tokio::test]
async fn failing_tool_propagates_error() {
    let mut registry = ToolRegistry::new();
    registry.register(FailTool);

    let err = registry.call_tool("fail_tool", json!({})).await.unwrap_err();
    assert!(matches!(err, ToolError::ExecutionFailed(_)));
    let ToolError::ExecutionFailed(msg) = err else { panic!("wrong variant") };
    assert!(msg.contains("intentional failure"));
}

#[test]
fn tool_info_includes_input_schema() {
    let mut registry = ToolRegistry::new();
    registry.register(PingTool);

    let tools = registry.list_tools();
    let schema = &tools[0].input_schema;
    assert_eq!(schema["type"], "object");
}
