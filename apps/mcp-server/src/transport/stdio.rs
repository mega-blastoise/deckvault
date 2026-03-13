use tokio::io::{self, AsyncBufReadExt, AsyncWriteExt, BufReader};
use crate::protocol::handler::Handler;
use crate::protocol::jsonrpc::{JsonRpcRequest, JsonRpcMessage, JsonRpcError, ErrorObject, PARSE_ERROR};
use crate::registry::ToolRegistry;

pub async fn run_stdio(registry: ToolRegistry) -> anyhow::Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let reader = BufReader::new(stdin);
    let mut lines = reader.lines();
    let mut handler = Handler::new(registry);

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
