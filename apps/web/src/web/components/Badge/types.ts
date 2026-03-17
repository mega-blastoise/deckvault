export type PokemonType =
  | 'Colorless'
  | 'Darkness'
  | 'Dragon'
  | 'Fairy'
  | 'Fighting'
  | 'Fire'
  | 'Grass'
  | 'Lightning'
  | 'Metal'
  | 'Psychic'
  | 'Water';

export type RarityType =
  | 'Common'
  | 'Uncommon'
  | 'Rare'
  | 'Rare Holo'
  | 'Rare Ultra'
  | 'Rare Secret';

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'error'
  | 'warning'
  | 'type'
  | 'rarity'
  | 'regulation';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  pokemonType?: PokemonType | string;
  rarity?: RarityType | string;
  size?: 'small' | 'medium';
  className?: string;
}
