use std::{env, sync::Arc};
use tracing_subscriber::filter::LevelFilter;

use pokemon_mcp_server::domains::db::Database;
use pokemon_mcp_server::domains::pricing::PricingClient;
use pokemon_mcp_server::registry::ToolRegistry;
use pokemon_mcp_server::tools::{
    search_cards::SearchCardsTool,
    get_card_by_id::GetCardByIdTool,
    list_sets::ListSetsTool,
    get_set_cards::GetSetCardsTool,
    compare_cards::CompareCardsTool,
    get_price_info::GetPriceInfoTool,
};
use pokemon_mcp_server::transport;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing to stderr (stdout is for JSON-RPC)
    tracing_subscriber::fmt()
        .with_max_level(LevelFilter::INFO)
        .with_writer(std::io::stderr)
        .init();

    // Open SQLite database (read-only)
    let db_path = std::env::var("DATABASE_PATH")
        .unwrap_or_else(|_| "database/pokemon-data.sqlite3.db".to_string());

    let db = Arc::new(Database::open(db_path.as_ref())?);

    tracing::info!(
        "Database opened: {} cards, {} sets",
        db.card_count()?,
        db.set_count()?
    );

    // Create pricing client
    let pricing = Arc::new(PricingClient::new());

    // Register tools
    let mut registry = ToolRegistry::new();
    registry.register(SearchCardsTool::new(Arc::clone(&db)));
    registry.register(GetCardByIdTool::new(Arc::clone(&db)));
    registry.register(ListSetsTool::new(Arc::clone(&db)));
    registry.register(GetSetCardsTool::new(Arc::clone(&db)));
    registry.register(CompareCardsTool::new(Arc::clone(&db)));
    registry.register(GetPriceInfoTool::new(Arc::clone(&db), Arc::clone(&pricing)));

    tracing::info!("Registered {} tools", registry.tool_count());

    // Parse transport from CLI args: --transport stdio|sse
    let transport = env::args()
        .skip_while(|a| a != "--transport")
        .nth(1)
        .unwrap_or_else(|| "stdio".to_string());

    tracing::info!("Pokemon MCP Server starting...");
    match transport.as_str() {
        "stdio" => transport::stdio::run_stdio(registry).await,
        "sse" => {
            let port: u16 = env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3001);
            transport::server_sent_events::run_sse(registry, port).await
        }
        other => anyhow::bail!("Unknown transport: {other}. Use 'stdio' or 'sse'."),
    }
}
