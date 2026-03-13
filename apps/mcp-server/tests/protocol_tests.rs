use pokemon_mcp_server::protocol::jsonrpc::{
    JsonRpcRequest, JsonRpcResponse, JsonRpcError, ErrorObject,
    RequestId, JsonRpcMessage, METHOD_NOT_FOUND, PARSE_ERROR,
};
use pokemon_mcp_server::protocol::mcp::{InitializeResult, ServerCapabilities, ServerInfo};

// ── RequestId round-trips ────────────────────────────────────────────────────

#[test]
fn request_id_string_round_trips() {
    let id = RequestId::String("abc-123".to_string());
    let json = serde_json::to_string(&id).unwrap();
    assert_eq!(json, r#""abc-123""#);
    let back: RequestId = serde_json::from_str(&json).unwrap();
    assert_eq!(back, id);
}

#[test]
fn request_id_number_round_trips() {
    let id = RequestId::Number(42);
    let json = serde_json::to_string(&id).unwrap();
    assert_eq!(json, "42");
    let back: RequestId = serde_json::from_str(&json).unwrap();
    assert_eq!(back, id);
}

// ── JsonRpcRequest deserialization ───────────────────────────────────────────

#[test]
fn jsonrpc_request_with_id_deserializes() {
    let raw = r#"{"jsonrpc":"2.0","method":"ping","id":1}"#;
    let req: JsonRpcRequest = serde_json::from_str(raw).unwrap();
    assert_eq!(req.method, "ping");
    assert!(req.id.is_some());
    assert!(req.params.is_none());
}

#[test]
fn jsonrpc_request_notification_has_no_id() {
    let raw = r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#;
    let req: JsonRpcRequest = serde_json::from_str(raw).unwrap();
    assert_eq!(req.method, "notifications/initialized");
    assert!(req.id.is_none());
}

#[test]
fn jsonrpc_request_with_params_deserializes() {
    let raw = r#"{"jsonrpc":"2.0","method":"tools/call","id":"x","params":{"name":"search_cards","arguments":{}}}"#;
    let req: JsonRpcRequest = serde_json::from_str(raw).unwrap();
    assert_eq!(req.method, "tools/call");
    let params = req.params.unwrap();
    assert_eq!(params["name"], "search_cards");
}

// ── JsonRpcResponse serialization ───────────────────────────────────────────

#[test]
fn jsonrpc_response_serializes_correctly() {
    let resp = JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        result: serde_json::json!({"ok": true}),
        id: RequestId::Number(1),
    };
    let json = serde_json::to_value(&resp).unwrap();
    assert_eq!(json["jsonrpc"], "2.0");
    assert_eq!(json["result"]["ok"], true);
    assert_eq!(json["id"], 1);
}

// ── JsonRpcError serialization ───────────────────────────────────────────────

#[test]
fn jsonrpc_error_serializes_with_code() {
    let err = JsonRpcError {
        jsonrpc: "2.0".to_string(),
        error: ErrorObject {
            code: METHOD_NOT_FOUND,
            message: "Method not found: foobar".to_string(),
            data: None,
        },
        id: Some(RequestId::Number(5)),
    };
    let json = serde_json::to_value(&err).unwrap();
    assert_eq!(json["error"]["code"], METHOD_NOT_FOUND);
    assert_eq!(json["jsonrpc"], "2.0");
    // data should be omitted when None
    assert!(json["error"].get("data").is_none() || json["error"]["data"].is_null());
}

#[test]
fn jsonrpc_error_parse_error_code() {
    assert_eq!(PARSE_ERROR, -32700);
}

#[test]
fn jsonrpc_error_method_not_found_code() {
    assert_eq!(METHOD_NOT_FOUND, -32601);
}

// ── JsonRpcMessage untagged enum ─────────────────────────────────────────────

#[test]
fn jsonrpc_message_response_variant_serializes_without_tag() {
    let msg = JsonRpcMessage::Response(JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        result: serde_json::json!({}),
        id: RequestId::Number(1),
    });
    let json = serde_json::to_value(&msg).unwrap();
    // untagged: no "type" key, just the inner fields
    assert!(json.get("result").is_some());
    assert!(json.get("error").is_none());
}

#[test]
fn jsonrpc_message_error_variant_serializes_without_tag() {
    let msg = JsonRpcMessage::Error(JsonRpcError {
        jsonrpc: "2.0".to_string(),
        error: ErrorObject {
            code: -32700,
            message: "parse error".to_string(),
            data: None,
        },
        id: None,
    });
    let json = serde_json::to_value(&msg).unwrap();
    assert!(json.get("error").is_some());
    assert!(json.get("result").is_none());
}

// ── InitializeResult camelCase field names ───────────────────────────────────

#[test]
fn initialize_result_serializes_camel_case() {
    let result = InitializeResult {
        protocol_version: "2024-11-05".to_string(),
        capabilities: ServerCapabilities {
            tools: None,
            resources: None,
        },
        server_info: ServerInfo {
            name: "pokemon-mcp-server".to_string(),
            version: "0.1.0".to_string(),
        },
    };
    let json = serde_json::to_value(&result).unwrap();
    assert!(json.get("protocolVersion").is_some(), "expected camelCase protocolVersion");
    assert_eq!(json["protocolVersion"], "2024-11-05");
    assert!(json.get("serverInfo").is_some(), "expected camelCase serverInfo");
    assert_eq!(json["serverInfo"]["name"], "pokemon-mcp-server");
}
