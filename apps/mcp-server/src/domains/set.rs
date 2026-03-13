use serde::{Deserialize, Serialize};

use crate::domains::card::Legalities;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardSet {
    pub id: String,
    pub name: String,
    pub series: String,
    pub printed_total: Option<i32>,
    pub total: Option<i32>,
    pub legalities: Option<Legalities>,
    pub ptcgo_code: Option<String>,
    pub release_date: Option<String>,
    pub updated_at: Option<String>,
    pub images: Option<SetImages>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetImages {
    #[serde(default)]
    pub symbol: Option<String>,
    #[serde(default)]
    pub logo: Option<String>,
}