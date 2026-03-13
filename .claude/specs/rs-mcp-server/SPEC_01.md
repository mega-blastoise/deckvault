# SPEC-01: Transport & Protocol (JSON-RPC 2.0)

## Context

MCP (Model Context Protocol) uses JSON-RPC 2.0 as its wire format. The primary transport is stdin/stdout — the client spawns the server as a child process and communicates via newline-delimited JSON messages on standard I/O.

This phase establishes the foundation: parsing JSON-RPC requests, routing to method handlers, and serializing responses. Every subsequent phase builds on these types.

### What You'll Learn

- Rust's enum system for modeling sum types (Request can be a call OR a notification)
- Serde's derive macros and attribute system (`#[serde(untagged)]`, `#[serde(skip_serializing_if)]`)
- `Option<T>` for nullable fields, `Result<T, E>` for fallible operations
- Async I/O with `tokio::io` for line-buffered stdin/stdout
- The module system: `mod`, `pub use`, file-per-module organization

## Prerequisites

- Rust 1.92.0 installed (per `.mise.toml`)
- `cargo init` in `apps/mcp-server/`
- Familiarity with JSON-RPC 2.0 spec: https://www.jsonrpc.org/specification

## Requirements

### 1. Project Scaffolding

Create the Rust crate within the monorepo:

```
apps/mcp-server/
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── lib.rs
│   ├── protocol/
│   │   ├── mod.rs
│   │   ├── jsonrpc.rs
│   │   ├── mcp.rs
│   │   └── handler.rs
│   └── transport/
│       ├── mod.rs
│       └── stdio.rs
└── tests/
    └── protocol_tests.rs
```

**Cargo.toml**:

```toml
[package]
name = "pokemon-mcp-server"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1.42", features = ["full"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
anyhow = "1.0"
```

### 2. JSON-RPC 2.0 Types (`protocol/jsonrpc.rs`)

Model the full JSON-RPC 2.0 type system. This is where serde mastery begins.

**Request ID** — can be a string, number, or null:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum RequestId {
    String(String),
    Number(i64),
}
```

**Request** — a method call (has `id`) or notification (no `id`):

```rust
#[derive(Debug, Clone, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub method: String,
    #[serde(default)]
    pub params: Option<serde_json::Value>,
    pub id: Option<RequestId>,
}
```

Key serde lessons:
- `#[serde(default)]` makes `params` default to `None` when missing from JSON
- `Option<RequestId>` distinguishes method calls (`id` present) from notifications (`id` absent)
- `serde_json::Value` is the escape hatch for "params can be anything"

**Successful response**:

```rust
#[derive(Debug, Clone, Serialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub result: serde_json::Value,
    pub id: RequestId,
}

impl JsonRpcResponse {
    pub fn new(id: RequestId, result: impl Serialize) -> Result<Self, serde_json::Error> {
        Ok(Self {
            jsonrpc: "2.0".to_string(),
            result: serde_json::to_value(result)?,
            id,
        })
    }
}
```

**Error response**:

```rust
#[derive(Debug, Clone, Serialize)]
pub struct JsonRpcError {
    pub jsonrpc: String,
    pub error: ErrorObject,
    pub id: Option<RequestId>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorObject {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}
```

Standard error codes:

```rust
pub const PARSE_ERROR: i32 = -32700;
pub const INVALID_REQUEST: i32 = -32600;
pub const METHOD_NOT_FOUND: i32 = -32601;
pub const INVALID_PARAMS: i32 = -32602;
pub const INTERNAL_ERROR: i32 = -32603;
```

**Outgoing message** — the server writes either a response or an error:

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum JsonRpcMessage {
    Response(JsonRpcResponse),
    Error(JsonRpcError),
}
```

### 3. MCP Protocol Types (`protocol/mcp.rs`)

MCP defines specific methods and parameter shapes on top of JSON-RPC.

**Server capabilities and info**:

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServerCapabilities {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<ToolsCapability>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resources: Option<ResourcesCapability>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolsCapability {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub list_changed: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResourcesCapability {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscribe: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub list_changed: Option<bool>,
}
```

**Initialize handshake**:

```rust
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeParams {
    pub protocol_version: String,
    pub capabilities: serde_json::Value,
    pub client_info: ClientInfo,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClientInfo {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeResult {
    pub protocol_version: String,
    pub capabilities: ServerCapabilities,
    pub server_info: ServerInfo,
}
```

**MCP content types** (used in tool results):

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum Content {
    #[serde(rename = "text")]
    Text {
        text: String,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallToolResult {
    pub content: Vec<Content>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_error: Option<bool>,
}
```

### 4. Method Router (`protocol/handler.rs`)

Route incoming JSON-RPC methods to handler functions:

```rust
use crate::protocol::jsonrpc::*;
use crate::protocol::mcp::*;

pub struct Handler {
    initialized: bool,
}

impl Handler {
    pub fn new() -> Self {
        Self { initialized: false }
    }

    pub async fn handle_request(&mut self, request: &JsonRpcRequest) -> JsonRpcMessage {
        match request.method.as_str() {
            "initialize" => self.handle_initialize(request),
            "notifications/initialized" => {
                // Notification — no response needed
                // Return early; caller checks if id is None
                self.initialized = true;
                return self.empty_notification_ack();
            }
            "ping" => self.handle_ping(request),
            _ => self.method_not_found(request),
        }
    }

    fn handle_initialize(&mut self, request: &JsonRpcRequest) -> JsonRpcMessage {
        let result = InitializeResult {
            protocol_version: "2024-11-05".to_string(),
            capabilities: ServerCapabilities {
                tools: Some(ToolsCapability { list_changed: None }),
                resources: None,
            },
            server_info: ServerInfo {
                name: "pokemon-mcp-server".to_string(),
                version: "0.1.0".to_string(),
            },
        };

        match (&request.id, serde_json::to_value(&result)) {
            (Some(id), Ok(value)) => JsonRpcMessage::Response(JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                result: value,
                id: id.clone(),
            }),
            (None, _) => self.invalid_request(request),
            (_, Err(e)) => self.internal_error(request, &e.to_string()),
        }
    }

    fn handle_ping(&self, request: &JsonRpcRequest) -> JsonRpcMessage {
        match &request.id {
            Some(id) => JsonRpcMessage::Response(JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                result: serde_json::json!({}),
                id: id.clone(),
            }),
            None => self.invalid_request(request),
        }
    }

    fn method_not_found(&self, request: &JsonRpcRequest) -> JsonRpcMessage {
        JsonRpcMessage::Error(JsonRpcError {
            jsonrpc: "2.0".to_string(),
            error: ErrorObject {
                code: METHOD_NOT_FOUND,
                message: format!("Method not found: {}", request.method),
                data: None,
            },
            id: request.id.clone(),
        })
    }
}
```

### 5. Stdio Transport (`transport/stdio.rs`)

Read newline-delimited JSON from stdin, write responses to stdout:

```rust
use tokio::io::{self, AsyncBufReadExt, AsyncWriteExt, BufReader};
use crate::protocol::handler::Handler;
use crate::protocol::jsonrpc::{JsonRpcRequest, JsonRpcMessage, JsonRpcError, ErrorObject, PARSE_ERROR};

pub async fn run_stdio() -> anyhow::Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let reader = BufReader::new(stdin);
    let mut lines = reader.lines();
    let mut handler = Handler::new();

    while let Some(line) = lines.next_line().await? {
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }

        // Parse the JSON-RPC request
        let response = match serde_json::from_str::<JsonRpcRequest>(&line) {
            Ok(request) => {
                let msg = handler.handle_request(&request).await;
                // Notifications (no id) don't get a response
                if request.id.is_none() {
                    continue;
                }
                msg
            }
            Err(e) => {
                JsonRpcMessage::Error(JsonRpcError {
                    jsonrpc: "2.0".to_string(),
                    error: ErrorObject {
                        code: PARSE_ERROR,
                        message: format!("Parse error: {e}"),
                        data: None,
                    },
                    id: None,
                })
            }
        };

        // Serialize and write response
        let json = serde_json::to_string(&response)?;
        stdout.write_all(json.as_bytes()).await?;
        stdout.write_all(b"\n").await?;
        stdout.flush().await?;
    }

    Ok(())
}
```

### 6. Entry Point (`main.rs`)

```rust
use tracing_subscriber::EnvFilter;

mod protocol;
mod transport;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing to stderr (stdout is for JSON-RPC)
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .init();

    tracing::info!("Pokemon MCP Server starting...");

    transport::stdio::run_stdio().await
}
```

Note: logging goes to **stderr**, not stdout. stdout is exclusively for JSON-RPC messages.

## File Structure

```
apps/mcp-server/
├── Cargo.toml
├── src/
│   ├── main.rs                  # Entry point
│   ├── lib.rs                   # Re-exports for tests
│   ├── protocol/
│   │   ├── mod.rs               # pub mod jsonrpc, mcp, handler;
│   │   ├── jsonrpc.rs           # ~100 lines: Request, Response, Error types
│   │   ├── mcp.rs               # ~80 lines: MCP-specific params/results
│   │   └── handler.rs           # ~100 lines: Method router
│   └── transport/
│       ├── mod.rs               # pub mod stdio;
│       └── stdio.rs             # ~50 lines: stdin/stdout loop
└── tests/
    └── protocol_tests.rs        # Round-trip serialization tests
```

## Acceptance Criteria

- [ ] `cargo build --manifest-path apps/mcp-server/Cargo.toml` compiles with 0 errors
- [ ] `cargo clippy --manifest-path apps/mcp-server/Cargo.toml -- -D warnings` reports 0 warnings
- [ ] Sending `initialize` request via stdin returns valid `InitializeResult` with `protocolVersion: "2024-11-05"`
- [ ] Sending `ping` request returns `{}` result
- [ ] Sending unknown method returns JSON-RPC error with code `-32601`
- [ ] Sending malformed JSON returns JSON-RPC error with code `-32700`
- [ ] Sending a notification (no `id` field) produces no stdout output
- [ ] `cargo test` passes: round-trip serialization of all JSON-RPC types
- [ ] Logging output appears on stderr only, never stdout
- [ ] Binary runs and exits cleanly when stdin is closed (EOF)

## Verification

```bash
# Build
cargo build --manifest-path apps/mcp-server/Cargo.toml

# Lint
cargo clippy --manifest-path apps/mcp-server/Cargo.toml -- -D warnings

# Test
cargo test --manifest-path apps/mcp-server/Cargo.toml

# Integration: initialize handshake
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}},"id":1}' \
  | cargo run 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['result']['protocolVersion']=='2024-11-05'; print('PASS')"

# Integration: ping
echo '{"jsonrpc":"2.0","method":"ping","id":2}' \
  | cargo run 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['result']=={}; print('PASS')"

# Integration: unknown method
echo '{"jsonrpc":"2.0","method":"bogus","id":3}' \
  | cargo run --manifest-path apps/mcp-server/Cargo.toml 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['error']['code']==-32601; print('PASS')"

# Integration: malformed JSON
echo 'not json at all' \
  | cargo run 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['error']['code']==-32700; print('PASS')"
```

## Dependencies

None — this is the foundation spec.

## Key Learning Moments

### 1. Why `#[serde(untagged)]` on `RequestId`?

JSON-RPC says `id` can be a string or number. In TypeScript you'd write `type Id = string | number`.
In Rust, you model this as an enum and tell serde to try each variant in order:

```rust
#[derive(Serialize, Deserialize)]
#[serde(untagged)]
pub enum RequestId {
    String(String),  // Try string first
    Number(i64),     // Then try number
}
```

Without `untagged`, serde would expect `{"String": "abc"}` instead of just `"abc"`.

### 2. Why `serde_json::Value` for params?

MCP's `params` field varies per method — `initialize` has `protocolVersion`, `tools/call` has
`name` and `arguments`. Rather than creating an enum of every possible params shape upfront,
we accept `Value` and deserialize into specific types inside each handler. This is the
"parse, don't validate at the boundary" pattern — validate inside the handler where you
know the expected shape.

### 3. Why log to stderr?

The stdio transport uses stdout for JSON-RPC messages. If you `println!("debug info")`,
you'll corrupt the JSON-RPC stream. All logging goes to stderr via `tracing_subscriber`'s
`.with_writer(std::io::stderr)`.
