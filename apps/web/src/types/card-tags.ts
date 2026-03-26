export type CardFunctionalTag =
  | 'draw'
  | 'pokemon_search'
  | 'trainer_search'
  | 'energy_search'
  | 'energy_acceleration'
  | 'energy_recovery'
  | 'hand_disruption'
  | 'ability_lock'
  | 'item_lock'
  | 'stadium_removal'
  | 'switch'
  | 'pivot'
  | 'bench_setup'
  | 'discard_recovery'
  | 'spread_damage'
  | 'healing'
  | 'boss_gust';

export interface TagCategory {
  label: string;
  tags: CardFunctionalTag[];
}

export const TAG_CATEGORIES: TagCategory[] = [
  {
    label: 'Draw & Search',
    tags: ['draw', 'pokemon_search', 'trainer_search', 'energy_search']
  },
  {
    label: 'Energy',
    tags: ['energy_acceleration', 'energy_recovery']
  },
  {
    label: 'Disruption',
    tags: ['hand_disruption', 'ability_lock', 'item_lock', 'stadium_removal']
  },
  {
    label: 'Recovery',
    tags: ['discard_recovery']
  },
  {
    label: 'Mobility',
    tags: ['switch', 'pivot']
  },
  {
    label: 'Setup',
    tags: ['bench_setup']
  },
  {
    label: 'Damage',
    tags: ['spread_damage', 'boss_gust']
  },
  {
    label: 'Utility',
    tags: ['healing']
  }
];

export const TAG_LABELS: Record<CardFunctionalTag, string> = {
  draw: 'Draw',
  pokemon_search: 'Pokémon Search',
  trainer_search: 'Trainer Search',
  energy_search: 'Energy Search',
  energy_acceleration: 'Energy Acceleration',
  energy_recovery: 'Energy Recovery',
  hand_disruption: 'Hand Disruption',
  ability_lock: 'Ability Lock',
  item_lock: 'Item Lock',
  stadium_removal: 'Stadium Removal',
  switch: 'Switch',
  pivot: 'Pivot',
  bench_setup: 'Bench Setup',
  discard_recovery: 'Discard Recovery',
  spread_damage: 'Spread Damage',
  healing: 'Healing',
  boss_gust: 'Boss / Gust'
};
