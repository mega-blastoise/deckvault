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

export const VALID_TAGS = new Set<CardFunctionalTag>([
  'draw',
  'pokemon_search',
  'trainer_search',
  'energy_search',
  'energy_acceleration',
  'energy_recovery',
  'hand_disruption',
  'ability_lock',
  'item_lock',
  'stadium_removal',
  'switch',
  'pivot',
  'bench_setup',
  'discard_recovery',
  'spread_damage',
  'healing',
  'boss_gust'
]);

// Each tag maps to patterns matched against LOWER(rules) OR LOWER(abilities)
export const TAG_PATTERNS: Record<CardFunctionalTag, string[]> = {
  draw: [
    '%draw % card%',
    '%draw until%',
    '%draw 2%',
    '%draw 3%',
    '%draw 4%',
    '%draw 5%',
    '%draw 6%',
    '%draw 7%'
  ],
  pokemon_search: [
    '%search your deck for a%pokemon%',
    '%search your deck for up to%pokemon%',
    '%put a pokemon from your deck%',
    '%look at the top%put%pokemon%'
  ],
  trainer_search: [
    '%search your deck for a%trainer%',
    '%search your deck for an%item%',
    '%search your deck for a%supporter%',
    '%search your deck for a%stadium%'
  ],
  energy_search: [
    '%search your deck for%energy%',
    '%basic energy card from your deck%',
    '%search your deck for up to%energy%'
  ],
  energy_acceleration: [
    '%attach%energy%from your deck%',
    '%attach%energy%from your hand to%',
    '%attach%extra%energy%',
    '%attach 2%energy%',
    '%attach 3%energy%',
    '%may attach%energy%from your hand%'
  ],
  energy_recovery: [
    '%energy%from your discard%',
    '%put%energy%from your discard%',
    '%attach%energy%from your discard%',
    '%retrieve%energy%'
  ],
  hand_disruption: [
    '%opponent shuffles%hand%into%deck%',
    '%opponent discards%card%',
    '%each player discards%',
    '%put%opponent%hand%bottom%deck%',
    '%shuffle%hand%into%deck%draw%'
  ],
  ability_lock: [
    '%abilities%can%t be used%',
    '%abilities are blocked%',
    "%pokémon%abilities%can%t be activated%",
    '%no abilities%'
  ],
  item_lock: [
    "%can%t play any item%",
    "%player can%t play item%",
    '%item cards can%t be played%'
  ],
  stadium_removal: [
    '%discard%stadium%in play%',
    '%remove%stadium%',
    '%put%stadium%into%discard%'
  ],
  switch: [
    '%switch your active%',
    '%move your active%to your bench%',
    '%switch it with%bench%'
  ],
  pivot: [
    '%retreat cost%0%',
    '%switch%to your bench%',
    '%move%to your bench%',
    '%free retreat%'
  ],
  bench_setup: [
    '%put%pokémon%onto your bench%',
    '%put a basic%pokémon%bench%',
    '%search your deck for%basic%put%bench%'
  ],
  discard_recovery: [
    '%from your discard pile%',
    '%put%from your discard%into your hand%',
    '%recover%from%discard%',
    '%shuffle%discard%into%deck%'
  ],
  spread_damage: [
    '%damage to each%',
    '%damage counter%on each%',
    '%place%damage counter%on all%',
    '%does%damage to all%'
  ],
  healing: [
    '%remove%damage counter%',
    '%heal%damage%',
    '%remove all%damage%',
    '%remove up to%damage counter%'
  ],
  boss_gust: [
    "%switch 1 of your opponent%s benched%",
    "%move your opponent%s active%to the bench%",
    "%choose 1 of your opponent%s benched%active%"
  ]
};
