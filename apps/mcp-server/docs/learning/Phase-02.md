
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
