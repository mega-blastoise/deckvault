use std::path::Path;
use std::sync::Arc;

use async_trait::async_trait;
use serde::Serialize;
use serde_json::{json, Value};

use crate::domains::db::Database;
use crate::domains::deck::parse_deck_file;
use crate::protocol::mcp::{CallToolResult, Content};
use crate::registry::tool::{Tool, ToolError};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbabilityReport {
    pub deck_size: u32,
    pub complete: bool,
    pub opening_hand: Vec<CardProbability>,
    pub prized_risk: Vec<PrizedEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardProbability {
    pub card_id: String,
    pub name: String,
    pub copies: u32,
    pub p_open: f64,
    pub p_exactly_one: f64,
    pub p_exactly_two: f64,
    pub p_prized: Option<f64>,
    pub turn_curve: Vec<TurnCurveEntry>,
    pub spotlight: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnCurveEntry {
    pub turn: u8,
    pub p_at_least_one: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrizedEntry {
    pub card_id: String,
    pub name: String,
    pub copies: u32,
    pub p_prized: f64,
}

fn ln_combinations(n: u64, k: u64) -> f64 {
    if k > n {
        return f64::NEG_INFINITY;
    }
    if k == 0 || k == n {
        return 0.0;
    }
    let k = k.min(n - k);
    let mut result = 0.0;
    for i in 0..k {
        result += ((n - i) as f64).ln() - ((i + 1) as f64).ln();
    }
    result
}

fn round4(v: f64) -> f64 {
    (v * 10000.0).round() / 10000.0
}

pub struct AnalyzeProbabilityTool {
    db: Arc<Database>,
}

impl AnalyzeProbabilityTool {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }
}

#[async_trait]
impl Tool for AnalyzeProbabilityTool {
    fn name(&self) -> &str {
        "analyze_deck_probability"
    }

    fn description(&self) -> &str {
        "Compute hypergeometric draw probabilities for every card in a deck. \
         Returns opening-hand odds, exact-count probabilities, prize-card risk \
         for low-copy cards, and a turn-by-turn curve (turns 1-4). Optionally \
         spotlight specific card IDs to pin them to the top of the report."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "required": ["path"],
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Absolute or relative path to the deck TOML or JSON file"
                },
                "spotlight": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Optional list of card IDs to highlight at the top of the report"
                }
            }
        })
    }

    async fn execute(&self, arguments: Value) -> Result<CallToolResult, ToolError> {
        let path_str = arguments
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidArguments("path is required".to_string()))?;

        let spotlight_ids: Vec<String> = arguments
            .get("spotlight")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        let path = Path::new(path_str);
        let deck_file = parse_deck_file(path).map_err(|e| {
            ToolError::ExecutionFailed(format!("Failed to parse deck file: {e}"))
        })?;

        let n: u64 = deck_file.cards.iter().map(|c| u64::from(c.quantity)).sum();
        let complete = n == 60;
        let hand_size: u64 = 7;
        let prize_count: u64 = 6;

        let ln_c_n_hand = ln_combinations(n, hand_size);
        let ln_c_n_prize = ln_combinations(n, prize_count);

        let mut opening_hand: Vec<CardProbability> = Vec::new();
        let mut prized_risk: Vec<PrizedEntry> = Vec::new();

        for entry in &deck_file.cards {
            let k = u64::from(entry.quantity);
            let card = self.db.get_card_by_id(&entry.id).ok().flatten();
            let name = card.map_or_else(|| entry.id.clone(), |c| c.name);
            let is_spotlight = spotlight_ids.contains(&entry.id);

            // p_open = 1 - C(N-K, 7) / C(N, 7)
            let p_open = round4(1.0 - (ln_combinations(n - k, hand_size) - ln_c_n_hand).exp());

            // p_exactly_one = C(K,1) * C(N-K, 6) / C(N, 7)
            let p_exactly_one = round4(
                (ln_combinations(k, 1) + ln_combinations(n - k, hand_size - 1) - ln_c_n_hand)
                    .exp(),
            );

            // p_exactly_two = C(K,2) * C(N-K, 5) / C(N, 7)
            let p_exactly_two = if k >= 2 {
                round4(
                    (ln_combinations(k, 2) + ln_combinations(n - k, hand_size - 2) - ln_c_n_hand)
                        .exp(),
                )
            } else {
                0.0
            };

            // p_prized: only for K <= 2
            let p_prized = if k <= 2 {
                Some(round4(
                    1.0 - (ln_combinations(n - k, prize_count) - ln_c_n_prize).exp(),
                ))
            } else {
                None
            };

            // turn_curve: for T in 1..=4, cards seen = 7 + T
            let turn_curve: Vec<TurnCurveEntry> = (1..=4)
                .map(|t| {
                    let draw = hand_size + u64::from(t);
                    let p = round4(
                        1.0 - (ln_combinations(n - k, draw) - ln_combinations(n, draw)).exp(),
                    );
                    TurnCurveEntry {
                        turn: t,
                        p_at_least_one: p,
                    }
                })
                .collect();

            if let Some(p) = p_prized {
                prized_risk.push(PrizedEntry {
                    card_id: entry.id.clone(),
                    name: name.clone(),
                    copies: entry.quantity,
                    p_prized: p,
                });
            }

            opening_hand.push(CardProbability {
                card_id: entry.id.clone(),
                name,
                copies: entry.quantity,
                p_open,
                p_exactly_one,
                p_exactly_two,
                p_prized,
                turn_curve,
                spotlight: is_spotlight,
            });
        }

        // Sort prized_risk descending by p_prized
        prized_risk.sort_by(|a, b| b.p_prized.partial_cmp(&a.p_prized).unwrap_or(std::cmp::Ordering::Equal));

        // Sort opening_hand: spotlight first, then descending by p_open
        opening_hand.sort_by(|a, b| {
            b.spotlight
                .cmp(&a.spotlight)
                .then_with(|| b.p_open.partial_cmp(&a.p_open).unwrap_or(std::cmp::Ordering::Equal))
        });

        let report = ProbabilityReport {
            deck_size: u32::try_from(n).unwrap_or(u32::MAX),
            complete,
            opening_hand,
            prized_risk,
        };

        let json_text = serde_json::to_string_pretty(&report)
            .map_err(|e| ToolError::ExecutionFailed(e.to_string()))?;

        Ok(CallToolResult {
            content: vec![Content::Text { text: json_text }],
            is_error: None,
        })
    }
}
