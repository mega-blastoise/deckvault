use serde::Deserialize;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use axum::{
    extract::{State, Query, Json},
    http::StatusCode,
    response::sse::{Event, KeepAlive, Sse},
    routing::{get, post}, Router
};
use tokio::signal;
use tokio::sync::{mpsc, Mutex};
use tokio_stream::wrappers::ReceiverStream;
use tokio_stream::StreamExt;
use uuid::Uuid;

use crate::{protocol::{handler::Handler, jsonrpc::{JsonRpcMessage, JsonRpcRequest}}, registry::ToolRegistry};

pub struct Session {
    pub tx: mpsc::Sender<JsonRpcMessage>,
}

pub type SessionMap = Arc<Mutex<HashMap<String, Session>>>;

#[derive(Clone)]
pub struct AppState {
    pub sessions: SessionMap,
    pub handler: Arc<Mutex<Handler>>,
}

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