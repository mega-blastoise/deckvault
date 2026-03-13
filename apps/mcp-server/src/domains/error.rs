use thiserror::Error;

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum DomainError {
    #[error("Card not found: {0}")]
    CardNotFound(String),

    #[error("Set not found: {0}")]
    SetNotFound(String),

    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("JSON parse error in column '{column}': {source}")]
    ColumnParse {
        column: String,
        source: serde_json::Error,
    },

    #[error("Lock poisoned: {0}")]
    Lock(String),

    #[error("Invalid query: {0}")]
    InvalidQuery(String),

    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Pricing unavailable for card: {0}")]
    PricingUnavailable(String),
}