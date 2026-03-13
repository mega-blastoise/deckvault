use crate::protocol::jsonrpc;
use crate::protocol::jsonrpc::*;
use crate::protocol::mcp::*;

use crate::registry::ToolRegistry;

/// NOTE: Important: tool execution errors are returned as `CallToolResult` with `is_error: true`,
/// NOT as JSON-RPC error responses. JSON-RPC errors are only for protocol-level failures
/// (parse error, method not found, etc.). This distinction matters for MCP compliance.
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
            Ok(result) => {
                self.success_response(request, serde_json::to_value(&result).unwrap_or_default())
            }
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

    pub async fn handle_request(&mut self, request: &JsonRpcRequest) -> JsonRpcMessage {
        match request.method.as_str() {
            "initialize" => self.handle_initialize(request),
            "notifications/initialized" => {
                // Notification — no response needed
                // Return early; caller checks if id is None
                self.initialized = true;
                self.empty_notification_ack(request)
            }
            "ping" => self.handle_ping(request),
            "tools/list" => self.handle_tools_list(request),
            "tools/call" => self.handle_tools_call(request).await,
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

    fn invalid_request(&self, request: &JsonRpcRequest) -> JsonRpcMessage {
        JsonRpcMessage::Error(JsonRpcError {
            jsonrpc: "2.0".to_string(),
            error: ErrorObject {
                code: INVALID_REQUEST,
                message: "Invalid request".to_string(),
                data: None,
            },
            id: request.id.clone(),
        })
    }

    fn empty_notification_ack(&self, request: &JsonRpcRequest) -> JsonRpcMessage {
        JsonRpcMessage::Response(JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            result: serde_json::json!({}),
            id: request.id.clone().unwrap_or(jsonrpc::RequestId::Number(-1)),
        })
    }

    fn internal_error(&self, request: &JsonRpcRequest, message: &str) -> JsonRpcMessage {
        JsonRpcMessage::Error(JsonRpcError {
            jsonrpc: "2.0".to_string(),
            error: ErrorObject {
                code: INTERNAL_ERROR,
                message: message.to_string(),
                data: None,
            },
            id: request.id.clone(),
        })
    }

    fn invalid_params(&self, request: &JsonRpcRequest, message: &str) -> JsonRpcMessage {
        JsonRpcMessage::Error(JsonRpcError {
            jsonrpc: "2.0".to_string(),
            error: ErrorObject {
                code: INVALID_PARAMS,
                message: message.to_string(),
                data: None,
            },
            id: request.id.clone(),
        })
    }

    fn success_response(
        &self,
        request: &JsonRpcRequest,
        result: serde_json::Value,
    ) -> JsonRpcMessage {
        JsonRpcMessage::Response(JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            result,
            id: request.id.clone().unwrap(),
        })
    }
}
