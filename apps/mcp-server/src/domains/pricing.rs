use serde::{Deserialize, Serialize};
use reqwest::Client;
use crate::domains::error::DomainError;

const POKEMON_TCG_API_BASE: &str = "https://api.pokemontcg.io/v2/cards";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct PricePoint {
    #[serde(default)]
    pub low: Option<f64>,
    #[serde(default)]
    pub mid: Option<f64>,
    #[serde(default)]
    pub high: Option<f64>,
    #[serde(default)]
    pub market: Option<f64>,
    #[serde(default)]
    pub direct_low: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TcgPlayerPricing {
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub prices: Option<serde_json::Value>,  // Dynamic keys: holofoil, reverseHolofoil, normal, etc.
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardMarketPricing {
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub prices: Option<serde_json::Value>,  // Dynamic keys: averageSellPrice, trendPrice, etc.
}

#[derive(Debug, Clone, Deserialize)]
pub struct ApiCardResponse {
    pub data: ApiCardData,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiCardData {
    #[allow(dead_code)]
    pub id: String,
    #[allow(dead_code)]
    pub name: String,
    #[serde(default)]
    pub tcgplayer: Option<TcgPlayerPricing>,
    #[serde(default)]
    pub cardmarket: Option<CardMarketPricing>,
}

pub struct PricingClient {
    client: Client,
}

impl Default for PricingClient {
    fn default() -> Self {
        Self::new()
    }
}

impl PricingClient {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .expect("Failed to create HTTP client");
        Self { client }
    }

    pub async fn fetch_pricing(&self, card_id: &str) -> Result<ApiCardData, DomainError> {
        let url = format!("{POKEMON_TCG_API_BASE}/{card_id}");

        let response: ApiCardResponse = self.client
            .get(&url)
            .header("User-Agent", "pokemon-mcp-server/0.1.0")
            .send()
            .await?
            .error_for_status()
            .map_err(|e| DomainError::PricingUnavailable(
                format!("{card_id}: {e}")
            ))?
            .json()
            .await?;

        Ok(response.data)
    }
}