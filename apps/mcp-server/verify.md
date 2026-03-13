# Verification Steps for MCP Server Functionality

1. Smoke-test stdio manually

The fastest check — pipe JSON-RPC directly to the binary:

cd apps/mcp-server

## initialize

```bash
echo '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities ":{},"clientInfo":{"name":"test","version":"1.0"}}}' \
    | DATABASE_PATH=./database/pokemon-data.sqlite3.db \
    cargo run -- --transport stdio 2>/dev/null
```

## tools/list

```bash
echo '{"jsonrpc":"2.0","method":"tools/list","id":2}' \
    | DATABASE_PATH=./database/pokemon-data.sqlite3.db \
    cargo run -- --transport stdio 2>/dev/null

# search_cards
echo '{"jsonrpc":"2.0","method":"tools/call","id":3,"params":{"name":"search_cards","arguments":{"query":"Pikachu","limit":3}}}' \
    | DATABASE_PATH=./database/pokemon-data.sqlite3.db \
    cargo run -- --transport stdio 2>/dev/null
```

Expected: each returns a JSON object with a result field, no error field.

2. Run the full test suite

```bash
cargo test --manifest-path apps/mcp-server/Cargo.toml
```

All 26 tests should pass. If any integration test hangs, the binary likely crashed on startup (check
DATABASE_PATH is correct).

3. Verify the SSE transport

In one terminal:

```
DATABASE_PATH=/home/nicks-dgx/dev/.Project-Johto/Pokemon/apps/mcp-server/database/pokemon-data.sqlite3.db \
cargo run --manifest-path apps/mcp-server/Cargo.toml -- --transport sse
```

In a second terminal:

## Connect to SSE stream — should receive an "endpoint" event with a session ID

```bash
curl -N http://localhost:3001/sse
```

You should see:
event: endpoint
data: /message?sessionId=<uuid>

Then in a third terminal, send a message using the session ID from the endpoint event:

```bash
SESSION_ID="08f676f8-517c-4c79-a20c-0daf1954fdfd"
curl -X POST "http://localhost:3001/message?sessionId=$SESSION_ID" \
-H "Content-Type: application/json" \
-d '{"jsonrpc":"2.0","method":"ping","id":1}'
```

The SSE stream in terminal 2 should receive:
event: message
data: {"jsonrpc":"2.0","result":{},"id":1}

4. Verify the MCP config with Claude Code

Restart Claude Code in the project root. Claude Code reads .mcp.json on startup. Once running, you should be able to use the pokemon-tcg tools directly in the chat.

Quick check — ask Claude Code: "Use the search_cards tool to find Charizard cards". If the server wires up correctly, Claude will call the tool and return real card data from the SQLite database.

If the server fails to start you'll see an MCP connection error in the Claude Code status bar. The most
common causes:

- Cargo not on PATH in the Claude Code shell environment
- DATABASE_PATH not resolving (the .mcp.json uses absolute paths, so this should be fine)

5. Verify database counts

```bash
echo '{"jsonrpc":"2.0","method":"tools/call","id":1,"params":{"name":"list_sets","arguments":{}}}' \
| DATABASE_PATH=./database/pokemon-data.sqlite3.db \
    cargo run --manifest-path apps/mcp-server/Cargo.toml -- --transport stdio 2>/dev/null \
| python3 -c "import json,sys; d=json.load(sys.stdin); text=d['result']['content'][0]['text'];
print(text[:500])"
```

The spec requires 19,818 cards and 170 sets. You can cross-check with:

```bash
sqlite3 apps/mcp-server/database/pokemon-data.sqlite3.db \
"SELECT (SELECT COUNT(*) FROM pokemon_cards) AS cards, (SELECT COUNT(*) FROM pokemon_card_sets) AS
sets;"
```

---
6. Error path verification

## Unknown method → should return error.code -32601

echo '{"jsonrpc":"2.0","method":"nonexistent","id":1}' \
| DATABASE_PATH=./database/pokemon-data.sqlite3.db \
    cargo run --manifest-path apps/mcp-server/Cargo.toml -- --transport stdio 2>/dev/null

## Malformed JSON → should return error.code -32700

echo 'not json at all' \
| DATABASE_PATH=./database/pokemon-data.sqlite3.db \
    cargo run --manifest-path apps/mcp-server/Cargo.toml -- --transport stdio 2>/dev/null

## Unknown tool → result.isError true (not a JSON-RPC error)

echo '{"jsonrpc":"2.0","method":"tools/call","id":1,"params":{"name":"fake_tool","arguments":{}}}' \
| DATABASE_PATH=./database/pokemon-data.sqlite3.db \
    cargo run --manifest-path apps/mcp-server/Cargo.toml -- --transport stdio 2>/dev/null
