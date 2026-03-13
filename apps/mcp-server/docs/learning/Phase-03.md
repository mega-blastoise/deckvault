# Key Learning Moments

## 1. Why `rusqlite` instead of `sqlx`?

`sqlx` is async and supports compile-time query verification — great for production APIs.
But for a read-only MCP server with simple queries, `rusqlite` is simpler:

```
rusqlite                          sqlx
├── Synchronous API               ├── Async API
├── No macros needed               ├── sqlx::query!() macro
├── No build-time DB connection    ├── Needs DATABASE_URL at compile time
├── Lightweight (~100KB)           ├── Heavier (~500KB+)
└── Perfect for read-only          └── Better for read-write with pools
```

Since MCP tool execution is already async (via `async_trait`), the synchronous SQLite
calls happen on the tokio thread — fine for read-only queries that complete in microseconds.

### 2. JSON-in-TEXT columns: the parsing pattern

The SQLite schema stores arrays and objects as JSON text in TEXT columns:

```
subtypes column: '["Stage 2"]'           → Vec<String>
attacks column:  '[{"name":"Fire Spin",...}]' → Vec<Attack>
legalities column: '{"unlimited":"Legal"}'   → Legalities struct
evolves_from column: '"Charmeleon"'       → String (note: JSON string WITH quotes)
```

The `parse_json_array` and `parse_json_object` helpers handle this uniformly:

```rust
fn parse_json_array<T: DeserializeOwned>(row: &Row, column: &str) -> Vec<T> {
    row.get::<_, Option<String>>(column)  // Step 1: Get TEXT as Option<String>
        .ok()                              // Step 2: Convert Result → Option
        .flatten()                         // Step 3: Option<Option<String>> → Option<String>
        .and_then(|s| serde_json::from_str(&s).ok())  // Step 4: Parse JSON
        .unwrap_or_default()               // Step 5: Fall back to empty Vec
}
```

Each step is null-safe. No panics. No unwraps. If the column is NULL or contains
malformed JSON, you get an empty vec or None — never a crash.

### 3. Why `Arc<Database>` instead of cloning the Connection?

`rusqlite::Connection` is not `Clone`. You can't just pass it to multiple tools.
`Arc` (Atomic Reference Counting) provides shared ownership:

```rust
let db = Arc::new(Database::open(...)?);
let tool_a = SearchCardsTool::new(Arc::clone(&db));    // +1 refcount
let tool_b = GetCardByIdTool::new(Arc::clone(&db));    // +1 refcount
// All tools share the same Connection; no copying
```

Note: `rusqlite::Connection` is NOT `Sync` by default. Since our MCP server handles
one request at a time on the stdio transport, this isn't a problem. For Phase 4 (SSE
with concurrent connections), we'll need `Arc<Mutex<Database>>` or one connection per
request.

### 4. Dynamic SQL with parameterized queries

The `search_cards_filtered` method builds SQL dynamically based on which filters are
provided. This is safe because:

- Column names are hardcoded strings (not user input)
- Values go through `?` parameter binding (SQL injection impossible)
- The `conditions` vec is built programmatically from known-safe strings

```rust
// SAFE: "types LIKE ?" with bound parameter
conditions.push("types LIKE ?");
param_values.push(Box::new(format!("%\"{t}\"%")));

// UNSAFE (never do this): format!("types LIKE '%{t}%'")
```

### 5. Live pricing as an async boundary

The `get_price_info` tool is the only tool that makes network calls. This teaches:

- `reqwest::Client` with timeout configuration
- `.send().await?.json::<T>().await?` chaining
- Error conversion: `reqwest::Error` → `DomainError::Http` → `ToolError`
- Graceful degradation: if the API is down, return a clear error message
