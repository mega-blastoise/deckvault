/// End-to-end integration tests via stdio transport.
///
/// Each test spawns the compiled binary, sends JSON-RPC over stdin,
/// and reads the response from stdout. The DATABASE_PATH env var is set
/// to the test database bundled in the repo.
use std::io::Write;
use std::process::{Command, Stdio};

const DB_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/database/pokemon-data.sqlite3.db"
);

/// Build the binary once via `cargo build` before running tests.
/// In CI this is guaranteed; locally it ensures the binary is fresh.
fn binary_path() -> std::path::PathBuf {
    let mut path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("target/debug/pokemon-mcp-server");
    path
}

struct McpProcess {
    child: std::process::Child,
}

impl McpProcess {
    fn spawn() -> Self {
        let child = Command::new(binary_path())
            .arg("--transport")
            .arg("stdio")
            .env("DATABASE_PATH", DB_PATH)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("Failed to spawn mcp server binary. Run `cargo build` first.");
        McpProcess { child }
    }

    fn send(&mut self, msg: &str) -> String {
        let stdin = self.child.stdin.as_mut().unwrap();
        writeln!(stdin, "{msg}").unwrap();
        stdin.flush().unwrap();

        // Read one response line
        use std::io::BufRead;
        let stdout = self.child.stdout.as_mut().unwrap();
        let mut reader = std::io::BufReader::new(stdout);
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        line.trim().to_string()
    }
}

impl Drop for McpProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

// ── initialize ───────────────────────────────────────────────────────────────

#[test]
fn initialize_returns_protocol_version() {
    let mut proc = McpProcess::spawn();
    let response = proc.send(
        r#"{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}"#,
    );
    let json: serde_json::Value = serde_json::from_str(&response).unwrap();
    assert_eq!(json["result"]["protocolVersion"], "2024-11-05");
    assert_eq!(json["id"], 1);
}

// ── ping ─────────────────────────────────────────────────────────────────────

#[test]
fn ping_returns_empty_object() {
    let mut proc = McpProcess::spawn();
    let response = proc.send(r#"{"jsonrpc":"2.0","method":"ping","id":2}"#);
    let json: serde_json::Value = serde_json::from_str(&response).unwrap();
    assert_eq!(json["result"], serde_json::json!({}));
    assert_eq!(json["id"], 2);
}

// ── tools/list ───────────────────────────────────────────────────────────────

#[test]
fn tools_list_returns_all_pokemon_tools() {
    let mut proc = McpProcess::spawn();
    let response = proc.send(r#"{"jsonrpc":"2.0","method":"tools/list","id":3}"#);
    let json: serde_json::Value = serde_json::from_str(&response).unwrap();
    let tools = json["result"]["tools"].as_array().unwrap();
    assert_eq!(tools.len(), 9, "expected exactly 9 tools, got {}", tools.len());

    let names: Vec<&str> = tools
        .iter()
        .filter_map(|t| t["name"].as_str())
        .collect();
    assert!(names.contains(&"search_cards"), "missing search_cards");
    assert!(names.contains(&"get_card_by_id"), "missing get_card_by_id");
    assert!(names.contains(&"list_sets"), "missing list_sets");
    assert!(names.contains(&"get_set_cards"), "missing get_set_cards");
    assert!(names.contains(&"compare_cards"), "missing compare_cards");
    assert!(names.contains(&"get_price_info"), "missing get_price_info");
    assert!(names.contains(&"load_deck"), "missing load_deck");
    assert!(names.contains(&"validate_deck"), "missing validate_deck");
    assert!(
        names.contains(&"analyze_deck_probability"),
        "missing analyze_deck_probability"
    );
}

// ── tools/call search_cards ──────────────────────────────────────────────────

#[test]
fn tools_call_search_cards_returns_card_data() {
    let mut proc = McpProcess::spawn();
    let response = proc.send(
        r#"{"jsonrpc":"2.0","method":"tools/call","id":4,"params":{"name":"search_cards","arguments":{"query":"Charizard","limit":3}}}"#,
    );
    let json: serde_json::Value = serde_json::from_str(&response).unwrap();
    // No JSON-RPC error
    assert!(json.get("error").is_none(), "unexpected error: {json}");
    let content = &json["result"]["content"];
    assert!(content.is_array());
    let text = content[0]["text"].as_str().unwrap();
    // Should contain card data
    assert!(
        text.contains("Charizard") || text.contains("Found"),
        "unexpected content: {text}"
    );
}

// ── unknown method ───────────────────────────────────────────────────────────

#[test]
fn unknown_method_returns_method_not_found_error() {
    let mut proc = McpProcess::spawn();
    let response = proc.send(r#"{"jsonrpc":"2.0","method":"no_such_method","id":5}"#);
    let json: serde_json::Value = serde_json::from_str(&response).unwrap();
    assert_eq!(json["error"]["code"], -32601);
}

// ── malformed JSON ───────────────────────────────────────────────────────────

#[test]
fn malformed_json_returns_parse_error() {
    let mut proc = McpProcess::spawn();
    let response = proc.send(r#"{ this is not valid json "#);
    let json: serde_json::Value = serde_json::from_str(&response).unwrap();
    assert_eq!(json["error"]["code"], -32700);
}

// ── notification produces no response ────────────────────────────────────────

#[test]
fn notification_without_id_produces_no_response_then_next_request_works() {
    let mut proc = McpProcess::spawn();
    // Send a notification (no id), then a ping with id
    // The notification should produce NO stdout line; the ping should be the first response
    let stdin = proc.child.stdin.as_mut().unwrap();
    writeln!(stdin, r#"{{"jsonrpc":"2.0","method":"notifications/initialized"}}"#).unwrap();
    writeln!(stdin, r#"{{"jsonrpc":"2.0","method":"ping","id":99}}"#).unwrap();
    stdin.flush().unwrap();

    use std::io::BufRead;
    let stdout = proc.child.stdout.as_mut().unwrap();
    let mut reader = std::io::BufReader::new(stdout);
    let mut line = String::new();
    reader.read_line(&mut line).unwrap();
    let json: serde_json::Value = serde_json::from_str(line.trim()).unwrap();
    // The first (and only) response should be the ping
    assert_eq!(json["id"], 99, "expected ping response, got: {json}");
    assert_eq!(json["result"], serde_json::json!({}));
}

// ── Standard legality ────────────────────────────────────────────────────────
//
// Regulation marks only exist from Sword & Shield onward, so a blank mark means
// "printed before marks existed", not "exempt". Both the search filter and the
// deck validator used to read a blank mark as legal, which let the entire
// 1999-2019 back catalogue through. Basic Energy is the one genuine exemption
// and is identified by supertype/subtype rather than by its blank mark.

/// `ex2-88` Rare Candy (2003, no mark) vs `me1-125` Rare Candy (mark I).
#[test]
fn search_cards_standard_only_excludes_cards_printed_before_regulation_marks() {
    let mut proc = McpProcess::spawn();
    let response = proc.send(
        r#"{"jsonrpc":"2.0","method":"tools/call","id":10,"params":{"name":"search_cards","arguments":{"query":"Rare Candy","limit":50,"standard_only":true,"format":"json"}}}"#,
    );
    let json: serde_json::Value = serde_json::from_str(&response).unwrap();
    let text = json["result"]["content"][0]["text"].as_str().unwrap();
    let cards: Vec<serde_json::Value> = serde_json::from_str(text).unwrap();

    assert!(!cards.is_empty(), "expected at least one Standard Rare Candy");
    for card in &cards {
        let mark = card["regulationMark"].as_str().unwrap_or("");
        assert!(
            matches!(mark, "H" | "I" | "J"),
            "{} leaked past standard_only with mark {mark:?}",
            card["id"]
        );
    }
}

#[test]
fn search_cards_without_standard_only_still_returns_old_printings() {
    let mut proc = McpProcess::spawn();
    let response = proc.send(
        r#"{"jsonrpc":"2.0","method":"tools/call","id":11,"params":{"name":"search_cards","arguments":{"query":"Rare Candy","limit":50,"format":"json"}}}"#,
    );
    let json: serde_json::Value = serde_json::from_str(&response).unwrap();
    let text = json["result"]["content"][0]["text"].as_str().unwrap();
    let cards: Vec<serde_json::Value> = serde_json::from_str(text).unwrap();
    assert!(
        cards.iter().any(|c| c["id"] == "ex2-88"),
        "unfiltered search should still reach the back catalogue"
    );
}

#[test]
fn search_cards_standard_only_keeps_basic_energy() {
    let mut proc = McpProcess::spawn();
    let response = proc.send(
        r#"{"jsonrpc":"2.0","method":"tools/call","id":12,"params":{"name":"search_cards","arguments":{"query":"Basic Fire Energy","limit":50,"standard_only":true,"format":"json"}}}"#,
    );
    let json: serde_json::Value = serde_json::from_str(&response).unwrap();
    let text = json["result"]["content"][0]["text"].as_str().unwrap();
    let cards: Vec<serde_json::Value> = serde_json::from_str(text).unwrap();
    assert!(
        cards.iter().any(|c| c["id"] == "sve-2"),
        "Basic Energy has no regulation mark but is always legal"
    );
}

#[test]
fn validate_deck_flags_unmarked_cards_but_not_basic_energy() {
    let path = std::env::temp_dir().join(format!("johto-legality-{}.toml", std::process::id()));
    std::fs::write(
        &path,
        r#"name = "legality fixture"
format = "standard"
regulation_marks = ["H", "I", "J"]

[[cards]]
id = "ex2-88"
quantity = 4

[[cards]]
id = "me1-125"
quantity = 4

[[cards]]
id = "sve-2"
quantity = 52
"#,
    )
    .unwrap();

    let mut proc = McpProcess::spawn();
    let response = proc.send(&format!(
        r#"{{"jsonrpc":"2.0","method":"tools/call","id":13,"params":{{"name":"validate_deck","arguments":{{"path":"{}"}}}}}}"#,
        path.display()
    ));
    let _ = std::fs::remove_file(&path);

    let json: serde_json::Value = serde_json::from_str(&response).unwrap();
    let text = json["result"]["content"][0]["text"].as_str().unwrap();
    let report: serde_json::Value = serde_json::from_str(text).unwrap();
    let flagged: Vec<&str> = report["violations"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|v| v["rule"] == "LEGALITY")
        .filter_map(|v| v["cardId"].as_str())
        .collect();

    assert!(
        flagged.contains(&"ex2-88"),
        "a 2003 printing with no mark is not Standard legal: {flagged:?}"
    );
    assert!(!flagged.contains(&"me1-125"), "mark I is legal: {flagged:?}");
    assert!(
        !flagged.contains(&"sve-2"),
        "Basic Energy is always legal: {flagged:?}"
    );
}
