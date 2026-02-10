# SPEC-02: Tool & Resource Registry

## Context

MCP servers expose capabilities to clients through **tools** (functions the AI can call)
and **resources** (data the AI can read). Phase 1 gave us JSON-RPC plumbing; now we build
the abstraction layer that lets us register tools and dispatch calls to them.

This is where Rust's trait system becomes real. You'll define a `Tool` trait, store
implementations in a `HashMap<String, Box<dyn Tool>>`, and confront the realities of
trait objects, dynamic dispatch, and `Send + Sync` bounds.

### What You'll Learn

- Defining traits with async methods (`async_trait` macro)
- Trait objects: `Box<dyn Tool>` — what it means, when you need it
- Dynamic dispatch vs static dispatch (and why we choose dynamic here)
- `Send + Sync` bounds for cross-thread safety
- `serde_json::Value` ↔ typed struct conversion in handlers
- The `From<T>` trait for ergonomic type conversions
- Lifetime elision and why `'static` appears on trait object bounds

## Prerequisites

- SPEC-01 complete (JSON-RPC types, stdio transport, handler routing)

## Requirements

### 1. Tool Trait (`registry/tool.rs`)

Define the contract every tool must satisfy:

```rust
use async_trait::async_trait;
use serde_json::Value;
use crate::protocol::mcp::CallToolResult;

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
```

Why these bounds?

```
Box<dyn Tool + Send + Sync>
              │      │
              │      └── Safe to reference from multiple threads
              └── Safe to send across thread boundaries

Both are required because:
- The Handler may run on different tokio tasks (Send)
- Multiple requests may reference the registry concurrently (Sync)
```

### 2. Tool Error Type (`registry/tool.rs`)

A dedicated error type for tool execution failures, using `thiserror`:

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ToolError {
    #[error("Invalid arguments: {0}")]
    InvalidArguments(String),

    #[error("Tool execution failed: {0}")]
    ExecutionFailed(String),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}
```

Add `thiserror` to `Cargo.toml`:

```toml
thiserror = "2.0"
```

### 3. Tool Registry (`registry/mod.rs`)

A container that stores tools and dispatches calls:

```rust
use std::collections::HashMap;
use crate::registry::tool::{Tool, ToolError};
use crate::protocol::mcp::CallToolResult;
use serde_json::Value;

pub struct ToolRegistry {
    tools: HashMap<String, Box<dyn Tool>>,
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
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}
```

Key insight: `register` accepts `impl Tool + 'static` — the `'static` bound means the
tool cannot borrow short-lived data. Each tool must **own** its data. This is the simplest
lifetime model and appropriate for tools initialized at startup.

### 4. A Stub Tool for Testing

Create a simple "echo" tool to validate the registry before Pokemon tools exist:

```rust
// tools/echo.rs
use async_trait::async_trait;
use serde_json::{json, Value};
use crate::protocol::mcp::{CallToolResult, Content};
use crate::registry::tool::{Tool, ToolError};

pub struct EchoTool;

#[async_trait]
impl Tool for EchoTool {
    fn name(&self) -> &str {
        "echo"
    }

    fn description(&self) -> &str {
        "Echoes back the provided input (for testing)"
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "The message to echo back"
                }
            },
            "required": ["message"]
        })
    }

    async fn execute(&self, arguments: Value) -> Result<CallToolResult, ToolError> {
        let message = arguments
            .get("message")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidArguments("Missing 'message' field".to_string()))?;

        Ok(CallToolResult {
            content: vec![Content::Text {
                text: format!("Echo: {message}"),
            }],
            is_error: None,
        })
    }
}
```

### 5. Integrate Registry into Handler

Modify the `Handler` from SPEC-01 to own a `ToolRegistry` and route MCP methods:

```rust
// protocol/handler.rs (updated)
use crate::registry::ToolRegistry;

pub struct Handler {
    initialized: bool,
    registry: ToolRegistry,
}

impl Handler {
    pub fn new(registry: ToolRegistry) -> Self {
        Self {
            initialized: false,
            registry,
        }
    }

    pub async fn handle_request(&mut self, request: &JsonRpcRequest) -> JsonRpcMessage {
        match request.method.as_str() {
            "initialize" => self.handle_initialize(request),
            "notifications/initialized" => {
                self.initialized = true;
                return self.empty_notification_ack();
            }
            "ping" => self.handle_ping(request),
            "tools/list" => self.handle_tools_list(request),
            "tools/call" => self.handle_tools_call(request).await,
            _ => self.method_not_found(request),
        }
    }

    fn handle_tools_list(&self, request: &JsonRpcRequest) -> JsonRpcMessage {
        let tools = self.registry.list_tools();
        let result = serde_json::json!({ "tools": tools });
        self.success_response(request, result)
    }

    async fn handle_tools_call(&self, request: &JsonRpcRequest) -> JsonRpcMessage {
        // Extract tool name and arguments from params
        let params = match &request.params {
            Some(p) => p,
            None => return self.invalid_params(request, "Missing params"),
        };

        let name = match params.get("name").and_then(|v| v.as_str()) {
            Some(n) => n,
            None => return self.invalid_params(request, "Missing 'name' in params"),
        };

        let arguments = params
            .get("arguments")
            .cloned()
            .unwrap_or(serde_json::json!({}));

        match self.registry.call_tool(name, arguments).await {
            Ok(result) => self.success_response(
                request,
                serde_json::to_value(&result).unwrap_or_default(),
            ),
            Err(e) => {
                // Tool errors become MCP-level error content, not JSON-RPC errors
                let error_result = CallToolResult {
                    content: vec![Content::Text {
                        text: e.to_string(),
                    }],
                    is_error: Some(true),
                };
                self.success_response(
                    request,
                    serde_json::to_value(&error_result).unwrap_or_default(),
                )
            }
        }
    }
}
```

Important: tool execution errors are returned as `CallToolResult` with `is_error: true`,
NOT as JSON-RPC error responses. JSON-RPC errors are only for protocol-level failures
(parse error, method not found, etc.). This distinction matters for MCP compliance.

### 6. Wire Up in `main.rs`

```rust
// main.rs (updated)
mod protocol;
mod transport;
mod registry;
mod tools;

use registry::ToolRegistry;
use tools::echo::EchoTool;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .init();

    let mut registry = ToolRegistry::new();
    registry.register(EchoTool);

    tracing::info!("Registered {} tools", registry.tool_count());

    transport::stdio::run_stdio(registry).await
}
```

Note that `run_stdio` now accepts the registry and passes it to the `Handler`.

## File Structure

```
apps/mcp-server/src/
├── main.rs                      # Updated: creates registry, registers tools
├── lib.rs                       # Updated: re-exports registry module
├── protocol/
│   ├── mod.rs
│   ├── jsonrpc.rs               # Unchanged from SPEC-01
│   ├── mcp.rs                   # Unchanged from SPEC-01
│   └── handler.rs               # Updated: tools/list + tools/call routing
├── transport/
│   ├── mod.rs
│   └── stdio.rs                 # Updated: accepts ToolRegistry param
├── registry/
│   ├── mod.rs                   # ToolRegistry struct + ToolInfo
│   └── tool.rs                  # Tool trait + ToolError
└── tools/
    ├── mod.rs                   # pub mod echo;
    └── echo.rs                  # EchoTool (test/stub tool)
```

## Acceptance Criteria

- [ ] `cargo build` compiles with `async_trait` and `thiserror` dependencies
- [ ] `cargo clippy -- -D warnings` reports 0 warnings
- [ ] `tools/list` returns JSON with `tools` array containing `echo` tool metadata
- [ ] `tools/list` response includes `name`, `description`, and `inputSchema` for each tool
- [ ] `tools/call` with `{"name":"echo","arguments":{"message":"hello"}}` returns `"Echo: hello"` content
- [ ] `tools/call` with unknown tool name returns `CallToolResult` with `isError: true`
- [ ] `tools/call` with missing required argument returns `CallToolResult` with `isError: true`
- [ ] Tool errors are returned as MCP content (not JSON-RPC errors)
- [ ] `cargo test` passes: registry unit tests (register, list, call, error cases)
- [ ] EchoTool implements `Send + Sync` (compiles in multi-threaded context)

## Verification

```bash
# Build
cargo build --manifest-path apps/mcp-server/Cargo.toml

# Lint
cargo clippy --manifest-path apps/mcp-server/Cargo.toml -- -D warnings

# Test
cargo test --manifest-path apps/mcp-server/Cargo.toml

# Integration: tools/list
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
  | cargo run --manifest-path apps/mcp-server/Cargo.toml 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
tools = d['result']['tools']
assert len(tools) >= 1, f'Expected ≥1 tools, got {len(tools)}'
echo = next(t for t in tools if t['name'] == 'echo')
assert 'description' in echo
assert 'inputSchema' in echo
print('PASS: tools/list')
"

# Integration: tools/call with echo
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"echo","arguments":{"message":"hello"}},"id":2}' \
  | cargo run --manifest-path apps/mcp-server/Cargo.toml 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
content = d['result']['content']
assert content[0]['type'] == 'text'
assert 'hello' in content[0]['text']
print('PASS: tools/call echo')
"

# Integration: unknown tool
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"nonexistent","arguments":{}},"id":3}' \
  | cargo run --manifest-path apps/mcp-server/Cargo.toml 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['result']['isError'] == True
print('PASS: unknown tool error')
"
```

## Dependencies

- SPEC-01: Transport & Protocol (provides JSON-RPC types and stdio transport)

## Key Learning Moments

### 1. Why `Box<dyn Tool>` instead of generics?

With generics, every tool type creates a different `HashMap` type — you can't store
`SearchCardsTool` and `EchoTool` in the same HashMap. Trait objects (`Box<dyn Tool>`)
erase the concrete type, letting you store any implementor in one collection:

```rust
// This WON'T work — T is fixed for the whole HashMap:
// tools: HashMap<String, T> where T: Tool

// This DOES work — each value can be a different concrete type:
tools: HashMap<String, Box<dyn Tool>>
```

The cost: dynamic dispatch (vtable lookup) instead of static dispatch (monomorphization).
For an MCP server handling one request at a time, this cost is negligible.

### 2. Why `Send + Sync` on the trait?

Tokio may run your async code on different OS threads. `Send` means "safe to transfer
ownership between threads." `Sync` means "safe to share references between threads."
Without these bounds, the compiler would reject storing tools in an async context:

```
error: `dyn Tool` cannot be sent between threads safely
```

### 3. Why `async_trait`?

Rust's native `async fn` in traits is stabilized but returns opaque types that can't be
made into trait objects. `async_trait` desugars async methods into `Pin<Box<dyn Future>>`,
which IS object-safe. As of Rust 1.75+ there's native `async fn in trait`, but for
`dyn Tool` dispatch, `async_trait` remains the ergonomic choice.

### 4. Tool errors vs protocol errors

```
JSON-RPC Error (-32601)          MCP Tool Error (isError: true)
├── Parse error                  ├── Invalid arguments
├── Invalid request              ├── Card not found
├── Method not found             ├── Search returned no results
└── Internal error               └── Data loading failed

Left = protocol broke             Right = tool ran but failed
Left = JSON-RPC error response    Right = successful JSON-RPC response with error content
```

This is a subtle but important distinction in MCP. The client needs to know "did the
protocol work?" (JSON-RPC level) separately from "did the tool succeed?" (MCP level).
