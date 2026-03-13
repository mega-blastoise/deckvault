# Key Learning Moments

## 1. Why `#[serde(untagged)]` on `RequestId`?

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

## 2. Why `serde_json::Value` for params?

MCP's `params` field varies per method — `initialize` has `protocolVersion`, `tools/call` has
`name` and `arguments`. Rather than creating an enum of every possible params shape upfront,
we accept `Value` and deserialize into specific types inside each handler. This is the
"parse, don't validate at the boundary" pattern — validate inside the handler where you
know the expected shape.

## 3. Why log to stderr?

The stdio transport uses stdout for JSON-RPC messages. If you `println!("debug info")`,
you'll corrupt the JSON-RPC stream. All logging goes to stderr via `tracing_subscriber`'s
`.with_writer(std::io::stderr)`.
