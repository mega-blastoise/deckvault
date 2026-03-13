use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PokemonCard {
    pub id: String,
    pub name: String,
    pub supertype: String,
    pub subtypes: Vec<String>,
    pub hp: Option<i32>,
    pub types: Vec<String>,
    pub evolves_from: Option<String>,
    pub evolves_to: Vec<String>,
    pub rules: Vec<String>,
    pub abilities: Vec<Ability>,
    pub attacks: Vec<Attack>,
    pub weaknesses: Vec<Weakness>,
    pub retreat_cost: Vec<String>,
    pub converted_retreat_cost: Option<i32>,
    pub set_id: String,
    pub number: String,
    pub artist: Option<String>,
    pub rarity: Option<String>,
    pub flavor_text: Option<String>,
    pub national_pokedex_numbers: Vec<i32>,
    pub legalities: Option<Legalities>,
    pub images: Option<CardImages>,
    pub tcgplayer_url: Option<String>,
    pub cardmarket_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attack {
    pub name: String,
    #[serde(default)]
    pub cost: Vec<String>,
    #[serde(default)]
    pub converted_energy_cost: i32,
    #[serde(default)]
    pub damage: String,
    #[serde(default)]
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ability {
    pub name: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(rename = "type")]
    pub ability_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Weakness {
    #[serde(rename = "type")]
    pub weakness_type: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Legalities {
    #[serde(default)]
    pub unlimited: Option<String>,
    #[serde(default)]
    pub expanded: Option<String>,
    #[serde(default)]
    pub standard: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardImages {
    #[serde(default)]
    pub small: Option<String>,
    #[serde(default)]
    pub large: Option<String>,
}
