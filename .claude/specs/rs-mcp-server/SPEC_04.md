# SPEC-04: SSE Transport

## Context

Phases 1–3 built a working MCP server over stdin/stdout. Now we add an HTTP-based
Server-Sent Events (SSE) transport — MCP's second official transport mechanism. This
enables browser-based clients, remote connections, and concurrent sessions.

SSE transport is the capstone phase. It introduces `axum` for HTTP routing, `tokio::sync::mpsc`
channels for bidirectional communication over a unidirectional stream, `Arc<Mutex<T>>` for
shared mutable state, and concurrent connection management.

### What You'll Learn

- `axum` Router, handler functions, extractors (`State`, `Json`, `Path`)
- `tokio::sync::mpsc` channels for async message passing
- `Sse<impl Stream>` for server-sent event streams
- `Arc<Mutex<T>>` for thread-safe shared mutable state
- `tokio::spawn` for concurrent tasks
- `tokio::signal` for graceful shutdown
- UUID generation for session IDs
- CLI argument parsing for transport selection
- Error type unification across HTTP and domain boundaries

### MCP SSE Transport Protocol

The SSE transport works as follows:

```
1. Client connects:     GET /sse
   Server responds:     SSE stream with initial "endpoint" event
                        data: /message?sessionId=<uuid>

2. Client sends:        POST /message?sessionId=<uuid>
                        Body: JSON-RPC request
   Server responds:     202 Accepted (immediate)
                        SSE event on the stream (async result)

3. Repeat step 2 for each request

4. Client disconnects:  Closes SSE connection
   Server cleans up:    Drops channel, removes session
```

```
┌────────┐                                    ┌──────────────────────┐
│ Client │                                    │ axum HTTP Server      │
│        │                                    │                       │
│        │ ── GET /sse ─────────────────────▶ │  Create session:      │
│        │                                    │    id = uuid::new()   │
│        │ ◀── SSE: endpoint=/message?sid=... │    tx, rx = mpsc()    │
│        │                                    │    sessions[id] = tx  │
│        │ ── POST /message?sid=... ────────▶ │                       │
│        │    {"jsonrpc":"2.0",...}            │  Lookup session       │
│        │                                    │  handler.handle()     │
│        │ ◀── 202 Accepted ──────────────── │  tx.send(response)    │
│        │                                    │                       │
│        │ ◀── SSE: data={response json} ─── │  rx.recv() → SSE      │
│        │                                    │                       │
│        │  (connection closes)               │  Drop session         │
└────────┘                                    └──────────────────────┘
```

## Prerequisites

- SPEC-01 complete (JSON-RPC types)
- SPEC-02 complete (Tool registry)
- SPEC-03 complete (Domain tools working)

## Requirements

### 1. Dependencies

Add to `Cargo.toml`:

```toml
[dependencies]
# ... existing ...
axum = "0.8"
tokio-stream = "0.1"
uuid = { version = "1.0", features = ["v4"] }
```

### 2. CLI Transport Selection

The binary should support choosing the transport at startup:

```rust
// main.rs (updated)
use std::env;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .init();

    let db = Arc::new(Database::open(/* ... */)?);
    let pricing = Arc::new(PricingClient::new());
    let registry = build_registry(Arc::clone(&db), Arc::clone(&pricing));

    // Parse transport from CLI args: --transport stdio|sse
    let transport = env::args()
        .skip_while(|a| a != "--transport")
        .nth(1)
        .unwrap_or_else(|| "stdio".to_string());

    match transport.as_str() {
        "stdio" => transport::stdio::run_stdio(registry).await,
        "sse" => {
            let port: u16 = env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3001);
            transport::sse::run_sse(registry, port).await
        }
        other => anyhow::bail!("Unknown transport: {other}. Use 'stdio' or 'sse'."),
    }
}
```

### 3. Session State (`transport/sse.rs`)

Each SSE connection gets a session with its own channel:

```rust
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;
use crate::protocol::jsonrpc::JsonRpcMessage;

pub struct Session {
    pub tx: mpsc::Sender<JsonRpcMessage>,
}

pub type SessionMap = Arc<Mutex<HashMap<String, Session>>>;

#[derive(Clone)]
pub struct AppState {
    pub sessions: SessionMap,
    pub handler: Arc<Mutex<Handler>>,
}
```

Why `Arc<Mutex<Handler>>`? The `Handler` from SPEC-01/02 has `&mut self` on
`handle_request` (it tracks `initialized` state). Mutex provides interior mutability
so multiple axum handlers can share it.

### 4. SSE Connection Handler

When a client connects to `GET /sse`, create a session and return an SSE stream:

```rust
use axum::{
    extract::State,
    response::sse::{Event, KeepAlive, Sse},
};
use tokio_stream::wrappers::ReceiverStream;
use tokio_stream::StreamExt;

pub async fn sse_handler(
    State(state): State<AppState>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, std::convert::Infallible>>> {
    let session_id = Uuid::new_v4().to_string();
    let (tx, rx) = mpsc::channel::<JsonRpcMessage>(32);

    // Store session
    {
        let mut sessions = state.sessions.lock().await;
        sessions.insert(session_id.clone(), Session { tx });
    }

    tracing::info!("SSE client connected: {session_id}");

    // Build the SSE stream
    let endpoint_url = format!("/message?sessionId={session_id}");
    let session_id_clone = session_id.clone();
    let sessions_clone = Arc::clone(&state.sessions);

    let rx_stream = ReceiverStream::new(rx).map(move |msg| {
        let json = serde_json::to_string(&msg).unwrap_or_default();
        Ok(Event::default().event("message").data(json))
    });

    // Prepend the endpoint event, then stream responses
    let initial = tokio_stream::once(Ok(
        Event::default().event("endpoint").data(endpoint_url)
    ));

    let stream = initial.chain(rx_stream);

    // Spawn cleanup task for when the stream drops
    tokio::spawn(async move {
        // This runs when the SSE connection closes
        // We rely on the stream being dropped to signal disconnection
        // The session cleanup happens in the Drop or via a separate mechanism
        tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await;
        let mut sessions = sessions_clone.lock().await;
        if sessions.remove(&session_id_clone).is_some() {
            tracing::info!("Session expired: {session_id_clone}");
        }
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}
```

### 5. Message Handler

When a client sends `POST /message?sessionId=<id>`, process the JSON-RPC request
and push the response through the session's channel:

```rust
use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use crate::protocol::jsonrpc::JsonRpcRequest;

#[derive(Deserialize)]
pub struct MessageQuery {
    #[serde(rename = "sessionId")]
    pub session_id: String,
}

pub async fn message_handler(
    State(state): State<AppState>,
    Query(query): Query<MessageQuery>,
    Json(request): Json<JsonRpcRequest>,
) -> StatusCode {
    // Look up session
    let session_tx = {
        let sessions = state.sessions.lock().await;
        match sessions.get(&query.session_id) {
            Some(session) => session.tx.clone(),
            None => {
                tracing::warn!("Unknown session: {}", query.session_id);
                return StatusCode::NOT_FOUND;
            }
        }
    };

    // Handle the request
    let response = {
        let mut handler = state.handler.lock().await;
        handler.handle_request(&request).await
    };

    // Skip sending response for notifications (no id)
    if request.id.is_none() {
        return StatusCode::ACCEPTED;
    }

    // Send response through the SSE channel
    if let Err(e) = session_tx.send(response).await {
        tracing::error!("Failed to send response to session {}: {e}", query.session_id);
        return StatusCode::INTERNAL_SERVER_ERROR;
    }

    StatusCode::ACCEPTED
}
```

### 6. Server Setup

```rust
use axum::{routing::{get, post}, Router};
use std::net::SocketAddr;
use tokio::signal;

pub async fn run_sse(registry: ToolRegistry, port: u16) -> anyhow::Result<()> {
    let handler = Handler::new(registry);

    let state = AppState {
        sessions: Arc::new(Mutex::new(HashMap::new())),
        handler: Arc::new(Mutex::new(handler)),
    };

    let app = Router::new()
        .route("/sse", get(sse_handler))
        .route("/message", post(message_handler))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("SSE transport listening on http://{addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => tracing::info!("Ctrl+C received, shutting down"),
        _ = terminate => tracing::info!("SIGTERM received, shutting down"),
    }
}
```

### 7. Handler Concurrency Adaptation

The `Handler` from SPEC-01/02 uses `&mut self`. For SSE with concurrent sessions,
we wrap it in `Arc<Mutex<Handler>>`. This is a learning checkpoint — understanding
why `Mutex` is needed:

```
stdio transport:    One client, sequential requests → &mut self is fine
SSE transport:      Multiple clients, concurrent requests → need shared mutability

Solution: Arc<Mutex<Handler>>
├── Arc: Multiple owners (each axum task holds a reference)
├── Mutex: Only one task accesses Handler at a time
└── This serializes request handling — acceptable for Phase 4
```

Future optimization (out of scope): make `Handler` stateless or use `RwLock`, allowing
concurrent reads for `tools/list` while serializing `tools/call`.

### 8. Shared Database Access for SSE

In Phase 3, we noted that `rusqlite::Connection` is not `Sync`. For stdio (single-threaded),
`Arc<Database>` worked. For SSE with concurrent requests, we need thread safety:

```rust
// Option A: Mutex around the Database (simple, serializes all queries)
pub struct Database {
    conn: Mutex<Connection>,
}

// Option B: Connection pool (one per request, more concurrent)
pub struct Database {
    path: String,
}
impl Database {
    pub fn open_connection(&self) -> Result<Connection, DomainError> {
        Connection::open_with_flags(&self.path, OpenFlags::SQLITE_OPEN_READ_ONLY)
    }
}
```

**Recommendation**: Start with Option A (Mutex). It's simpler and sufficient for
an MCP server's request volume. If profiling shows contention, switch to Option B.

## File Structure

```
apps/mcp-server/src/
├── main.rs                          # Updated: CLI arg parsing, transport selection
├── transport/
│   ├── mod.rs                       # pub mod stdio, sse;
│   ├── stdio.rs                     # Unchanged from Phase 1
│   └── sse.rs                       # ~200 lines: SSE server, session management
└── (protocol/, registry/, tools/, domain/ unchanged)
```

## Acceptance Criteria

- [ ] `cargo build` compiles with `axum`, `tokio-stream`, `uuid` dependencies
- [ ] `cargo clippy -- -D warnings` reports 0 warnings
- [ ] `--transport stdio` works exactly as before (no regression)
- [ ] `--transport sse` starts HTTP server on configurable port (default 3001)
- [ ] `GET /sse` returns SSE stream with initial `endpoint` event containing message URL
- [ ] `POST /message?sessionId=<id>` with `tools/list` returns 202 and SSE event with tool list
- [ ] `POST /message` with invalid session ID returns 404
- [ ] Multiple concurrent SSE clients each get their own session and responses
- [ ] Responses arrive on the correct client's SSE stream (no cross-session leakage)
- [ ] Server shuts down cleanly on Ctrl+C (SIGINT) and SIGTERM
- [ ] `cargo test` passes: SSE handler tests (mocked sessions)
- [ ] Startup log shows transport type and port

## Verification

```bash
# Build
cargo build --manifest-path apps/mcp-server/Cargo.toml

# Lint
cargo clippy --manifest-path apps/mcp-server/Cargo.toml -- -D warnings

# Test
cargo test --manifest-path apps/mcp-server/Cargo.toml

# Start SSE server in background
DATABASE_PATH=./apps/mcp-server/database/pokemon-data.sqlite3.db \
  cargo run --manifest-path apps/mcp-server/Cargo.toml -- --transport sse &
SSE_PID=$!
sleep 3  # Wait for server to start

# Test 1: Connect and get endpoint URL
SESSION_URL=$(curl -sN http://localhost:3001/sse 2>/dev/null | head -2 | grep "^data:" | sed 's/^data: //')
echo "Session URL: $SESSION_URL"
# Should print: /message?sessionId=<uuid>

# Test 2: Send initialize request
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "http://localhost:3001${SESSION_URL}" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}},"id":1}'
# Should print: 202

# Test 3: Send tools/list
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "http://localhost:3001${SESSION_URL}" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2}'
# Should print: 202

# Test 4: Invalid session
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "http://localhost:3001/message?sessionId=bogus" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"ping","id":1}'
# Should print: 404

# Test 5: Verify stdio still works
echo '{"jsonrpc":"2.0","method":"ping","id":1}' \
  | DATABASE_PATH=./apps/mcp-server/database/pokemon-data.sqlite3.db \
    cargo run --manifest-path apps/mcp-server/Cargo.toml 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['result']=={}; print('PASS: stdio still works')"

# Cleanup
kill $SSE_PID 2>/dev/null
```

## Dependencies

- SPEC-01: Transport & Protocol (JSON-RPC types)
- SPEC-02: Tool/Resource Registry
- SPEC-03: Pokemon Domain Logic (working tools + DB layer)

## Key Learning Moments

### 1. Why channels for SSE?

SSE is a **one-way** stream from server to client. But MCP is **bidirectional** — the
client sends requests and expects responses. The pattern:

```
Client ── POST /message ──▶ Server processes request
                             │
                             ├── tx.send(response)
                             │
Client ◀── SSE event ─────── rx.recv()
```

`mpsc` (multi-producer, single-consumer) channel bridges POST requests to the SSE stream.
Multiple POST requests can send through `tx.clone()`, and the single SSE stream reads from `rx`.

### 2. `Arc<Mutex<T>>` — the shared mutable state pattern

```rust
let state = Arc::new(Mutex::new(thing));

// In handler A:
let mut guard = state.lock().await;  // Blocks if another handler holds the lock
guard.do_something();
// guard drops here → lock released

// In handler B:
let mut guard = state.lock().await;  // Waits for A to finish
guard.do_other_thing();
```

`Arc` = shared ownership (multiple axum tasks reference the same data)
`Mutex` = exclusive access (only one task modifies at a time)

This is Rust's answer to "how do I share mutable state across threads?" — the compiler
forces you to be explicit about synchronization. No data races possible.

### 3. axum extractors

axum uses the type system to extract data from HTTP requests:

```rust
pub async fn message_handler(
    State(state): State<AppState>,       // App state (from Router::with_state)
    Query(query): Query<MessageQuery>,   // ?sessionId=... from URL
    Json(request): Json<JsonRpcRequest>, // POST body parsed as JSON
) -> StatusCode {
```

Each parameter type tells axum what to extract and how. If extraction fails (e.g., invalid
JSON body), axum returns a 400 automatically — you never write that boilerplate.

### 4. Graceful shutdown

```rust
axum::serve(listener, app)
    .with_graceful_shutdown(shutdown_signal())
    .await?;
```

`shutdown_signal()` returns a future that resolves when Ctrl+C or SIGTERM is received.
When it resolves, axum stops accepting new connections, finishes in-flight requests,
and returns. This prevents data loss and zombie connections.

### 5. The session lifecycle

```
Connect:     GET /sse → create UUID, create channel, store in HashMap
Use:         POST /message → lookup session, handle, push to channel
Disconnect:  SSE stream drops → cleanup task removes session from HashMap
```

The `SessionMap = Arc<Mutex<HashMap<String, Session>>>` is the central coordination point.
It's a concurrent hash map protected by a Mutex. In production you might use `dashmap`
for better concurrency, but Mutex is clearer for learning.
